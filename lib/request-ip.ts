import crypto from 'node:crypto'

type HeaderBag = { get(name: string): string | null }

/**
 * The visitor's IP. On Netlify `x-nf-client-connection-ip` is the address the edge actually saw;
 * x-forwarded-for can carry client-supplied entries in front of it.
 */
export function requestIp(headers: HeaderBag): string {
  return headers.get('x-nf-client-connection-ip')?.trim()
    || headers.get('x-forwarded-for')?.split(',')[0].trim()
    || headers.get('x-real-ip')?.trim()
    || '0.0.0.0'
}

/** Keyed hash of the IP, so the raw address is never stored. */
export const hashIp = (ip: string, secret: string) => crypto.createHmac('sha256', secret).update(ip).digest('hex')
