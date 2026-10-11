// ============================================================
//  LUMIS • servidor (Express + MySQL)
//  Rodar local:  npm install && node server.js
//  Vercel:       api/index.js importa este arquivo (veja vercel.json)
// ============================================================
import "dotenv/config"
import express from "express"
import cors from "cors"
import mysql2 from "mysql2/promise"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 3000
const NA_VERCEL = Boolean(process.env.VERCEL)

if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
    throw new Error("Defina a variável JWT_SECRET (veja .env.example).")
}
const JWT_SECRET = process.env.JWT_SECRET || "dev-only-troque-isto"

const PAREAMENTO_MINUTOS = 30

const app = express()
app.set("trust proxy", 1)
app.use(express.json({ limit: "100kb" }))
app.use(cors())

const database = mysql2.createPool({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: NA_VERCEL ? 3 : 10,
    waitForConnections: true,
    charset: "utf8mb4",
    dateStrings: true
})

async function q(sql, params = []) {
    const [rows] = await database.query(sql, params)
    return rows
}

// ---------- cria as tabelas (schema.sql) ao iniciar ----------
async function migrar() {
    if (process.env.AUTO_MIGRATE === "false") return
    const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8")
    const comandos = sql
        .split("\n").filter(l => !l.trim().startsWith("--")).join("\n")
        .split(";").map(c => c.trim()).filter(Boolean)
    for (const comando of comandos) await database.query(comando)
}
const pronto = migrar().catch(e => console.warn("Migração ignorada:", e.message))
app.use((req, res, next) => { pronto.then(() => next()) })

// ---------- utilitários ----------
const erro = (res, status, mensagem) => res.status(status).json({ erro: mensagem })
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
const aleatorio = bytes => crypto.randomBytes(bytes).toString("hex")
const emailValido = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
const lerJson = (texto, padrao) => { try { return JSON.parse(texto) } catch { return padrao } }
const texto = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "")

// Limite simples de tentativas por IP (em memória: já ajuda contra força bruta)
const tentativas = new Map()
function limite(max, janelaMs) {
    return (req, res, next) => {
        const agora = Date.now()
        const chave = req.ip + "|" + req.path
        const t = (tentativas.get(chave) || []).filter(x => agora - x < janelaMs)
        if (t.length >= max) return erro(res, 429, "Muitas tentativas. Aguarde um instante e tente de novo.")
        t.push(agora)
        tentativas.set(chave, t)
        if (tentativas.size > 5000) tentativas.clear()
        next()
    }
}

function assinar(payload, expiraEm) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: expiraEm })
}

function lerToken(req, tipo) {
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "")
    const payload = jwt.verify(token, JWT_SECRET)
    if (payload.tipo !== tipo) throw new Error("tipo")
    return payload
}

function exigirUsuario(papel) {
    return (req, res, next) => {
        try {
            req.usuario = lerToken(req, "usuario")
        } catch {
            return erro(res, 401, "Sessão expirada. Entre novamente.")
        }
        if (papel && req.usuario.papel !== papel) return erro(res, 403, "Esta área é de outro perfil.")
        next()
    }
}

// ---------- montagem do perfil ----------
const diagnosticoParaApi = d => d && ({
    grau: d.grau,
    idadeAnos: Math.floor(d.idade_meses / 12),
    idadeMeses: d.idade_meses % 12,
    causa: d.causa || "",
    fezExames: !!d.fez_exames,
    exames: lerJson(d.exames, []),
    laudo: d.laudo_nome ? { nome: d.laudo_nome, tamanho: d.laudo_tamanho, tipo: d.laudo_tipo } : null,
    condicoes: lerJson(d.condicoes, []),
    outraCondicao: d.outra_condicao || ""
})

async function garantirCrianca(responsavelId) {
    const [existente] = await q("SELECT id, nome FROM lumis_criancas WHERE responsavel_id = ? ORDER BY id LIMIT 1", [responsavelId])
    if (existente) return existente
    const r = await database.query("INSERT INTO lumis_criancas (responsavel_id) VALUES (?)", [responsavelId])
    return { id: r[0].insertId, nome: null }
}

async function carregarPerfil(id) {
    const [u] = await q("SELECT id, nome, email, papel FROM lumis_usuarios WHERE id = ?", [id])
    if (!u) return null

    if (u.papel === "profissional") {
        const [f] = await q("SELECT respostas, concluido FROM lumis_profissionais_formulario WHERE usuario_id = ?", [id])
        return {
            usuario: u,
            status: { formulario: !!(f && f.concluido), completo: !!(f && f.concluido) },
            formulario: f ? lerJson(f.respostas, {}) : {}
        }
    }

    const [c] = await q("SELECT sistema, audio, imagem, armazenamento FROM lumis_consentimentos WHERE usuario_id = ?", [id])
    const [crianca] = await q("SELECT id, nome FROM lumis_criancas WHERE responsavel_id = ? ORDER BY id LIMIT 1", [id])
    const [dg] = crianca ? await q("SELECT * FROM lumis_diagnosticos WHERE crianca_id = ?", [crianca.id]) : []
    const privacidade = !!(c && c.sistema)
    const [aparelho] = await q(
        "SELECT id FROM lumis_pareamentos WHERE responsavel_id = ? AND status IN ('concluido','entregue') LIMIT 1", [id])
    return {
        usuario: u,
        status: { privacidade, diagnostico: !!dg, completo: privacidade && !!dg },
        aparelhoVinculado: !!aparelho,
        consentimento: c ? { sistema: !!c.sistema, audio: !!c.audio, imagem: !!c.imagem, armazenamento: !!c.armazenamento } : null,
        crianca: crianca || null,
        diagnostico: diagnosticoParaApi(dg) || null
    }
}

// ============================================================
//  SAÚDE
// ============================================================
app.get("/api/saude", wrap(async (req, res) => {
    await q("SELECT 1")
    res.json({ ok: true })
}))

// ============================================================
//  AUTENTICAÇÃO (responsável e profissional)
// ============================================================
app.post("/api/auth/cadastro", limite(15, 10 * 60 * 1000), wrap(async (req, res) => {
    const nome = texto(req.body.nome, 150)
    const email = texto(req.body.email, 190).toLowerCase()
    const senha = typeof req.body.senha === "string" ? req.body.senha : ""
    const papel = req.body.papel

    if (nome.length < 2) return erro(res, 400, "Informe seu nome completo.")
    if (!emailValido(email)) return erro(res, 400, "Informe um e-mail válido.")
    if (senha.length < 8) return erro(res, 400, "A senha precisa ter pelo menos 8 caracteres.")
    if (!["responsavel", "profissional"].includes(papel)) return erro(res, 400, "Perfil inválido.")
    if (req.body.aceitouTermos !== true) return erro(res, 400, "É preciso aceitar os Termos de Uso e a Política de Privacidade.")

    const [jaExiste] = await q("SELECT id FROM lumis_usuarios WHERE email = ?", [email])
    if (jaExiste) return erro(res, 409, "Já existe uma conta com este e-mail. Tente entrar.")

    const hash = await bcrypt.hash(senha, 10)
    const r = await database.query(
        "INSERT INTO lumis_usuarios (nome, email, senha_hash, papel, aceitou_termos_em) VALUES (?, ?, ?, ?, NOW())",
        [nome, email, hash, papel]
    )
    const usuario = { id: r[0].insertId, nome, email, papel }
    const token = assinar({ tipo: "usuario", id: usuario.id, papel }, "7d")
    res.status(201).json({ token, usuario })
}))

app.post("/api/auth/login", limite(20, 10 * 60 * 1000), wrap(async (req, res) => {
    const email = texto(req.body.email, 190).toLowerCase()
    const senha = typeof req.body.senha === "string" ? req.body.senha : ""
    const [u] = await q("SELECT id, nome, email, papel, senha_hash FROM lumis_usuarios WHERE email = ?", [email])
    const ok = u && await bcrypt.compare(senha, u.senha_hash)
    if (!ok) return erro(res, 401, "E-mail ou senha incorretos.")
    const token = assinar({ tipo: "usuario", id: u.id, papel: u.papel }, "7d")
    res.json({ token, usuario: { id: u.id, nome: u.nome, email: u.email, papel: u.papel } })
}))

app.get("/api/me", exigirUsuario(), wrap(async (req, res) => {
    const perfil = await carregarPerfil(req.usuario.id)
    if (!perfil) return erro(res, 401, "Conta não encontrada.")
    res.json(perfil)
}))

// ============================================================
//  RESPONSÁVEL • Privacidade e Segurança
// ============================================================
app.put("/api/responsavel/privacidade", exigirUsuario("responsavel"), wrap(async (req, res) => {
    const { sistema, audio, imagem, armazenamento } = req.body
    if (sistema !== true) return erro(res, 400, "A autorização de uso necessário é obrigatória para continuar.")
    await q(
        `INSERT INTO lumis_consentimentos (usuario_id, sistema, audio, imagem, armazenamento, versao, aceito_em)
         VALUES (?, 1, ?, ?, ?, 'v1', NOW())
         ON DUPLICATE KEY UPDATE sistema = 1, audio = VALUES(audio), imagem = VALUES(imagem),
                                 armazenamento = VALUES(armazenamento), aceito_em = NOW()`,
        [req.usuario.id, audio === true ? 1 : 0, imagem === true ? 1 : 0, armazenamento === true ? 1 : 0]
    )
    res.json({ ok: true })
}))

// ============================================================
//  RESPONSÁVEL • Diagnóstico e Histórico Clínico
// ============================================================
const GRAUS = ["leve", "moderada", "severa", "profunda", "investigacao"]
const EXAMES = ["audiometria", "bera", "eoa", "impedanciometria"]
const CONDICOES = ["nenhuma", "tea", "motor", "tdah", "outra"]

app.get("/api/responsavel/diagnostico", exigirUsuario("responsavel"), wrap(async (req, res) => {
    const perfil = await carregarPerfil(req.usuario.id)
    res.json({ diagnostico: perfil.diagnostico })
}))

app.put("/api/responsavel/diagnostico", exigirUsuario("responsavel"), wrap(async (req, res) => {
    const [consent] = await q("SELECT sistema FROM lumis_consentimentos WHERE usuario_id = ?", [req.usuario.id])
    if (!consent || !consent.sistema) return erro(res, 403, "Aceite a Privacidade e Segurança antes de preencher o diagnóstico.")

    const b = req.body
    const anos = Number(b.idadeAnos), meses = Number(b.idadeMeses)
    const exames = Array.isArray(b.exames) ? [...new Set(b.exames)].filter(x => EXAMES.includes(x)) : []
    let condicoes = Array.isArray(b.condicoes) ? [...new Set(b.condicoes)].filter(x => CONDICOES.includes(x)) : []
    const fezExames = b.fezExames === true

    if (!GRAUS.includes(b.grau)) return erro(res, 400, "Selecione o grau do diagnóstico.")
    if (!Number.isInteger(anos) || anos < 0 || anos > 18 || !Number.isInteger(meses) || meses < 0 || meses > 11)
        return erro(res, 400, "Informe a idade do diagnóstico.")
    if (typeof b.fezExames !== "boolean") return erro(res, 400, "Informe se já foram realizados exames auditivos.")
    if (fezExames && exames.length === 0) return erro(res, 400, "Selecione ao menos um procedimento realizado.")
    if (condicoes.length === 0) return erro(res, 400, "Selecione uma opção em condição associada (ou \"Nenhuma\").")
    if (condicoes.includes("nenhuma")) condicoes = ["nenhuma"]

    const laudo = fezExames && b.laudo && typeof b.laudo === "object" ? b.laudo : null
    const crianca = await garantirCrianca(req.usuario.id)

    await q(
        `INSERT INTO lumis_diagnosticos
           (crianca_id, grau, idade_meses, causa, fez_exames, exames, laudo_nome, laudo_tamanho, laudo_tipo, condicoes, outra_condicao)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE grau = VALUES(grau), idade_meses = VALUES(idade_meses), causa = VALUES(causa),
           fez_exames = VALUES(fez_exames), exames = VALUES(exames), laudo_nome = VALUES(laudo_nome),
           laudo_tamanho = VALUES(laudo_tamanho), laudo_tipo = VALUES(laudo_tipo),
           condicoes = VALUES(condicoes), outra_condicao = VALUES(outra_condicao)`,
        [
            crianca.id, b.grau, anos * 12 + meses, texto(b.causa, 255) || null,
            fezExames ? 1 : 0, JSON.stringify(fezExames ? exames : []),
            laudo ? texto(laudo.nome, 255) || null : null,
            laudo && Number.isFinite(Number(laudo.tamanho)) ? Math.max(0, Math.floor(Number(laudo.tamanho))) : null,
            laudo ? texto(laudo.tipo, 100) || null : null,
            JSON.stringify(condicoes),
            condicoes.includes("outra") ? texto(b.outraCondicao, 255) || null : null
        ]
    )
    res.json({ ok: true })
}))

// ============================================================
//  PROFISSIONAL • formulário (perguntas ainda serão definidas)
// ============================================================
app.get("/api/profissional/formulario", exigirUsuario("profissional"), wrap(async (req, res) => {
    const perfil = await carregarPerfil(req.usuario.id)
    res.json({ respostas: perfil.formulario, concluido: perfil.status.completo })
}))

app.put("/api/profissional/formulario", exigirUsuario("profissional"), wrap(async (req, res) => {
    const respostas = req.body.respostas && typeof req.body.respostas === "object" ? req.body.respostas : {}
    const json = JSON.stringify(respostas)
    if (json.length > 50000) return erro(res, 413, "Respostas grandes demais.")
    await q(
        `INSERT INTO lumis_profissionais_formulario (usuario_id, respostas, concluido) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE respostas = VALUES(respostas), concluido = VALUES(concluido)`,
        [req.usuario.id, json, req.body.concluido === true ? 1 : 0]
    )
    res.json({ ok: true })
}))

// ============================================================
//  PAREAMENTO  (aparelho ⇄ celular do adulto)
//
//  1. Aparelho:  POST /api/pareamentos            → codigo, token (vai no QR), segredo
//  2. Celular:   abre portal.html?t=TOKEN → POST /api/pareamentos/:token/escaneado
//  3. Celular:   PUT  /api/pareamentos/:token/etapa      (cadastro, privacidade, diagnostico)
//  4. Celular:   POST /api/pareamentos/:token/concluir   (depois de tudo preenchido)
//  5. Aparelho:  GET  /api/pareamentos/status (x-segredo) → ao concluir recebe deviceToken
//  6. Aparelho:  GET  /api/dispositivo/me  (Bearer deviceToken) → criança logada
// ============================================================
const PROGRESSO_ETAPA = { cadastro: 45, privacidade: 70, diagnostico: 90 }
const ATIVO = "expira_em > NOW() AND status IN ('aguardando','escaneado','cadastrando')"

async function novoCodigoCurto() {
    for (let i = 0; i < 20; i++) {
        const codigo = "LUMIS-" + String(crypto.randomInt(0, 10000)).padStart(4, "0")
        const [usado] = await q(`SELECT id FROM lumis_pareamentos WHERE codigo = ? AND ${ATIVO}`, [codigo])
        if (!usado) return codigo
    }
    throw new Error("Não foi possível gerar um código.")
}

app.post("/api/pareamentos", limite(20, 60 * 1000), wrap(async (req, res) => {
    await q("DELETE FROM lumis_pareamentos WHERE expira_em < DATE_SUB(NOW(), INTERVAL 1 DAY)")
    const codigo = await novoCodigoCurto()
    const token = aleatorio(24), segredo = aleatorio(24)
    await q(
        `INSERT INTO lumis_pareamentos (codigo, token, segredo, expira_em)
         VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
        [codigo, token, segredo, PAREAMENTO_MINUTOS]
    )
    res.status(201).json({ codigo, token, segredo, expiraEmSegundos: PAREAMENTO_MINUTOS * 60 })
}))

// Aparelho: acompanha o andamento. Quando conclui, entrega o token da criança (uma vez só).
app.get("/api/pareamentos/status", wrap(async (req, res) => {
    const segredo = req.get("x-segredo") || ""
    const [p] = await q("SELECT *, (expira_em <= NOW()) AS expirado FROM lumis_pareamentos WHERE segredo = ?", [segredo])
    if (!p) return erro(res, 404, "Pareamento não encontrado.")

    if (p.status === "concluido") {
        await q("UPDATE lumis_pareamentos SET status = 'entregue' WHERE id = ? AND status = 'concluido'", [p.id])
        const [crianca] = await q("SELECT id, nome FROM lumis_criancas WHERE id = ?", [p.crianca_id])
        const deviceToken = assinar({ tipo: "dispositivo", cid: p.crianca_id, rid: p.responsavel_id }, "90d")
        return res.json({ status: "concluido", progresso: 100, deviceToken, crianca })
    }
    if (p.status === "entregue") return res.json({ status: "entregue", progresso: 100 })
    if (Number(p.expirado)) return erro(res, 410, "O código expirou.")
    res.json({ status: p.status, progresso: p.progresso })
}))

// Celular: digitou o código em vez de ler o QR
app.post("/api/pareamentos/resolver", limite(10, 60 * 1000), wrap(async (req, res) => {
    const digitado = texto(req.body.codigo, 20).toUpperCase().replace(/[\s-]+/g, "")
    const m = digitado.match(/^(?:LUMIS)?(\d{4})$/)
    if (!m) return erro(res, 400, "Código inválido. Exemplo: LUMIS-8820")
    const codigo = "LUMIS-" + m[1]
    const [p] = await q(`SELECT token FROM lumis_pareamentos WHERE codigo = ? AND ${ATIVO} ORDER BY id DESC LIMIT 1`, [codigo])
    if (!p) return erro(res, 404, "Código não encontrado ou expirado. Veja o código atual na tela do aparelho.")
    res.json({ token: p.token })
}))

app.post("/api/pareamentos/:token/escaneado", limite(30, 60 * 1000), wrap(async (req, res) => {
    const [p] = await q(`SELECT id, status FROM lumis_pareamentos WHERE token = ? AND ${ATIVO}`, [req.params.token])
    if (!p) return erro(res, 410, "Este QR Code expirou. Veja o código atual na tela do aparelho.")
    if (p.status === "aguardando")
        await q("UPDATE lumis_pareamentos SET status = 'escaneado', progresso = GREATEST(progresso, 25) WHERE id = ?", [p.id])
    res.json({ ok: true })
}))

// Avanço antes do login (escolheu o perfil, abriu o cadastro...). Só aceita valores baixos.
app.post("/api/pareamentos/:token/avanco", limite(60, 60 * 1000), wrap(async (req, res) => {
    const v = Math.floor(Number(req.body.valor))
    if (!(v >= 25 && v <= 40)) return erro(res, 400, "Valor inválido.")
    const r = await database.query(
        `UPDATE lumis_pareamentos
            SET status = IF(status = 'aguardando', 'escaneado', status), progresso = GREATEST(progresso, ?)
          WHERE token = ? AND ${ATIVO}`, [v, req.params.token])
    if (r[0].affectedRows === 0) return erro(res, 410, "Este código expirou.")
    res.json({ ok: true })
}))

app.put("/api/pareamentos/:token/etapa", exigirUsuario("responsavel"), wrap(async (req, res) => {
    let valor = PROGRESSO_ETAPA[req.body.etapa]
    if (req.body.etapa === "progresso") {            // avanço fino durante o preenchimento
        const v = Math.floor(Number(req.body.valor))
        if (v >= 25 && v <= 95) valor = v
    }
    if (!valor) return erro(res, 400, "Etapa inválida.")
    const r = await database.query(
        `UPDATE lumis_pareamentos
            SET status = 'cadastrando', progresso = GREATEST(progresso, ?), responsavel_id = ?
          WHERE token = ? AND ${ATIVO} AND (responsavel_id IS NULL OR responsavel_id = ?)`,
        [valor, req.usuario.id, req.params.token, req.usuario.id]
    )
    if (r[0].affectedRows === 0) return erro(res, 410, "Este código expirou ou já está em uso por outra conta.")
    res.json({ ok: true })
}))

app.post("/api/pareamentos/:token/concluir", exigirUsuario("responsavel"), wrap(async (req, res) => {
    const perfil = await carregarPerfil(req.usuario.id)
    if (!perfil.status.completo) return erro(res, 400, "Conclua a Privacidade e o Diagnóstico antes de liberar o aparelho.")
    const crianca = await garantirCrianca(req.usuario.id)

    const [ja] = await q(
        "SELECT id FROM lumis_pareamentos WHERE token = ? AND responsavel_id = ? AND status IN ('concluido','entregue')",
        [req.params.token, req.usuario.id]
    )
    if (ja) return res.json({ ok: true, crianca })

    const r = await database.query(
        `UPDATE lumis_pareamentos
            SET status = 'concluido', progresso = 100, responsavel_id = ?, crianca_id = ?
          WHERE token = ? AND ${ATIVO} AND (responsavel_id IS NULL OR responsavel_id = ?)`,
        [req.usuario.id, crianca.id, req.params.token, req.usuario.id]
    )
    if (r[0].affectedRows === 0) return erro(res, 410, "Este código expirou ou já está em uso por outra conta.")
    res.json({ ok: true, crianca })
}))

// Aparelho já logado: quem é a criança desta sessão?
app.get("/api/dispositivo/me", wrap(async (req, res) => {
    let payload
    try { payload = lerToken(req, "dispositivo") } catch { return erro(res, 401, "Aparelho não autenticado.") }
    const [c] = await q(
        `SELECT c.id, c.nome, u.nome AS responsavel
           FROM lumis_criancas c JOIN lumis_usuarios u ON u.id = c.responsavel_id
          WHERE c.id = ?`, [payload.cid])
    if (!c) return erro(res, 401, "Conta da criança não encontrada.")
    res.json({ crianca: { id: c.id, nome: c.nome }, responsavel: c.responsavel })
}))

// ============================================================
//  Arquivos estáticos (só para rodar localmente; na Vercel o CDN serve)
// ============================================================
if (!NA_VERCEL) {
    app.use("/frontend", express.static(path.join(__dirname, "frontend")))
    app.get("/", (req, res) => res.redirect("/frontend/inicio.html"))
}

app.use("/api", (req, res) => erro(res, 404, "Rota não encontrada."))

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    if (err.type === "entity.parse.failed") return erro(res, 400, "JSON inválido.")
    console.error(err)
    erro(res, 500, "Erro interno. Tente novamente em instantes.")
})

if (!NA_VERCEL) {
    app.listen(PORT, () => console.log(`Servidor rodando em http://localhost:${PORT}`))
}

export default app