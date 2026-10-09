-- ============================================================
--  LUMIS • estrutura do banco (MySQL / MariaDB)
--  Todas as tabelas começam com "lumis_" para não colidir com
--  as de outros alunos no mesmo banco compartilhado.
--  O server.js executa este arquivo sozinho ao iniciar
--  (CREATE TABLE IF NOT EXISTS), então rodar à mão é opcional.
-- ============================================================

-- Contas de adultos (responsável OU profissional)
CREATE TABLE IF NOT EXISTS lumis_usuarios (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nome               VARCHAR(150) NOT NULL,
  email              VARCHAR(190) NOT NULL,
  senha_hash         VARCHAR(100) NOT NULL,
  papel              ENUM('responsavel','profissional') NOT NULL,
  aceitou_termos_em  DATETIME NOT NULL,
  criado_em          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_lumis_usuarios_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tela "Privacidade e Segurança": uma linha por responsável
CREATE TABLE IF NOT EXISTS lumis_consentimentos (
  usuario_id     INT UNSIGNED PRIMARY KEY,
  sistema        TINYINT(1) NOT NULL DEFAULT 0,   -- obrigatório
  audio          TINYINT(1) NOT NULL DEFAULT 0,
  imagem         TINYINT(1) NOT NULL DEFAULT 0,
  armazenamento  TINYINT(1) NOT NULL DEFAULT 0,
  versao         VARCHAR(20) NOT NULL DEFAULT 'v1',
  aceito_em      DATETIME NOT NULL,
  CONSTRAINT fk_lumis_consent_usuario FOREIGN KEY (usuario_id)
    REFERENCES lumis_usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- A "conta da criança": pertence a um responsável.
-- É ela que fica logada no aparelho do Lumis.
CREATE TABLE IF NOT EXISTS lumis_criancas (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  responsavel_id  INT UNSIGNED NOT NULL,
  nome            VARCHAR(100) NULL,               -- ainda não existe no formulário
  criado_em       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_lumis_criancas_resp (responsavel_id),
  CONSTRAINT fk_lumis_crianca_resp FOREIGN KEY (responsavel_id)
    REFERENCES lumis_usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tela "Diagnóstico e Histórico Clínico": uma linha por criança
CREATE TABLE IF NOT EXISTS lumis_diagnosticos (
  crianca_id      INT UNSIGNED PRIMARY KEY,
  grau            ENUM('leve','moderada','severa','profunda','investigacao') NOT NULL,
  idade_meses     SMALLINT UNSIGNED NOT NULL,      -- idade no diagnóstico, em meses
  causa           VARCHAR(255) NULL,
  fez_exames      TINYINT(1) NOT NULL DEFAULT 0,
  exames          TEXT NULL,                       -- JSON: ["audiometria","bera",...]
  laudo_nome      VARCHAR(255) NULL,               -- só metadados (upload do arquivo: a definir)
  laudo_tamanho   INT UNSIGNED NULL,
  laudo_tipo      VARCHAR(100) NULL,
  condicoes       TEXT NULL,                       -- JSON: ["tea","tdah",...]
  outra_condicao  VARCHAR(255) NULL,
  atualizado_em   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_lumis_diag_crianca FOREIGN KEY (crianca_id)
    REFERENCES lumis_criancas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Formulário do profissional (fono). As perguntas ainda não existem,
-- então as respostas ficam em JSON: dá para criar perguntas novas
-- sem mexer na tabela.
CREATE TABLE IF NOT EXISTS lumis_profissionais_formulario (
  usuario_id     INT UNSIGNED PRIMARY KEY,
  respostas      TEXT NULL,
  concluido      TINYINT(1) NOT NULL DEFAULT 0,
  atualizado_em  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_lumis_prof_usuario FOREIGN KEY (usuario_id)
    REFERENCES lumis_usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Pareamento entre o aparelho (tela do QR Code) e o celular do adulto
--   codigo  = "LUMIS-8820" (o que a pessoa pode digitar)
--   token   = vai dentro do QR Code (longo, difícil de adivinhar)
--   segredo = só o aparelho conhece; usado para acompanhar o andamento
CREATE TABLE IF NOT EXISTS lumis_pareamentos (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  codigo          VARCHAR(16) NOT NULL,
  token           CHAR(48) NOT NULL,
  segredo         CHAR(48) NOT NULL,
  status          ENUM('aguardando','escaneado','cadastrando','concluido','entregue') NOT NULL DEFAULT 'aguardando',
  progresso       TINYINT UNSIGNED NOT NULL DEFAULT 0,
  responsavel_id  INT UNSIGNED NULL,
  crianca_id      INT UNSIGNED NULL,
  expira_em       DATETIME NOT NULL,
  criado_em       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_lumis_pareamentos_token (token),
  UNIQUE KEY uq_lumis_pareamentos_segredo (segredo),
  KEY ix_lumis_pareamentos_codigo (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
