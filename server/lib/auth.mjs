/**
 * Authentication helpers: password hashing and JWT signing/verification.
 */
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.ADMIN_JWT_SECRET ?? 'change-me-in-production'
const SALT_ROUNDS = 10

export async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS)
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash)
}

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' })
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET)
}
