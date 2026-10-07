/**
 * Express middleware: authenticate admin routes via JWT Bearer token.
 */
import { verifyToken } from './auth.mjs'

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  try {
    const payload = verifyToken(token)
    req.admin = { id: payload.adminId, username: payload.username }
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}
