// Ponte para a Vercel: transforma o Express (server.js) em uma função serverless.
// Todas as chamadas /api/* caem aqui (veja o "rewrites" no vercel.json).
import app from "../server.js"

export default app
