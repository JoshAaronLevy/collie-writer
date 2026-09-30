import net from 'node:net'
import tls from 'node:tls'
import http from 'node:http'
import https from 'node:https'
import dgram from 'node:dgram'
import { syncBuiltinESMExports } from 'node:module'

// Trusted fixture code must not accidentally contact a service through Node APIs.
// Chromium requests are independently denied by protectSession.
export function denyTestNetwork(): void {
  const denied = (): never => {
    throw new Error('NETWORK_DENIED_IN_TEST')
  }
  net.Socket.prototype.connect = denied
  net.connect = denied
  net.createConnection = denied
  tls.connect = denied
  http.request = denied
  http.get = denied
  https.request = denied
  https.get = denied
  dgram.createSocket = denied
  globalThis.fetch = denied
  syncBuiltinESMExports()
}
