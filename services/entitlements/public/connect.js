// Browser session secret is separate from the app's claim and device credentials.
// The fragment is removed before loading any third-party script; it is never a query string.
const fragment = location.hash.slice(1).split('.')
history.replaceState(null, '', '/connect')
const [sessionId, browserSecret] = fragment
const status = document.getElementById('status')
const buy = document.getElementById('buy'), restore = document.getElementById('restore'), complete = document.getElementById('complete')
let busy = false, settings, paddleLoaded = false
async function call(path, extra = {}) {
  const response = await fetch(path, { method: 'POST', credentials: 'omit', redirect: 'error',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${browserSecret}` },
    body: JSON.stringify({ sessionId, ...extra }) })
  if (!response.ok) throw new Error('This purchase action could not finish. Return to Collie Writer to resume or start a new session. Existing writing and paid records are preserved.')
  return response.json()
}
async function action(work) {
  if (busy) return
  busy = true; buy.disabled = complete.disabled = true
  try { await work() } catch (error) { status.textContent = error.message }
  finally { busy = false; buy.disabled = complete.disabled = false }
}
buy.addEventListener('click', () => action(async () => {
  const checkout = await call('/v1/browser/checkout')
  if (!paddleLoaded) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.src = 'https://cdn.paddle.com/paddle/v2/paddle.js'
      script.onload = resolve; script.onerror = () => reject(new Error('Checkout could not load. Your purchase has not been confirmed.')); document.head.append(script)
    })
    if (settings.environment === 'sandbox') window.Paddle.Environment.set('sandbox')
    window.Paddle.Initialize({ token: settings.clientToken,
      checkout: { settings: { displayMode: 'overlay', locale: 'en', showAddDiscounts: false, allowLogout: false } },
      eventCallback: event => { if (event.name === 'checkout.completed') status.textContent = 'Payment submitted. Choose Check payment; the service must confirm it.' } })
    paddleLoaded = true
  }
  window.Paddle.Checkout.open({ transactionId: checkout.transactionId })
  complete.hidden = false
}))
restore.addEventListener('submit', event => {
  event.preventDefault()
  void action(async () => {
    const input = document.getElementById('code'), recoveryCode = input.value.trim(); input.value = ''
    await call('/v1/browser/restore', { recoveryCode })
    status.textContent = 'Purchase connected. Return to Collie Writer and choose Check completion.'
    restore.hidden = true
  })
})
complete.addEventListener('click', () => action(async () => {
  const result = await call('/v1/browser/recovery')
  if (!result.ready) { status.textContent = 'Payment is not yet confirmed. You can check again later.'; return }
  document.getElementById('recovery').hidden = false
  document.getElementById('saved-code').value = result.recoveryCode
  status.textContent = 'Keep your recovery code, then choose Check completion in Collie Writer.'
}))
document.getElementById('saved-code').addEventListener('focus', event => event.target.select())
if (!/^[0-9a-f-]{36}$/.test(sessionId ?? '') || !/^[A-Za-z0-9_-]{43}$/.test(browserSecret ?? '')) {
  status.textContent = 'Start a purchase or restore from Collie Writer. This page needs the session opened by the app.'
} else void action(async () => {
  settings = await call('/v1/browser/read')
  restore.hidden = settings.kind !== 'restore'
  buy.hidden = settings.kind === 'restore'
  status.textContent = settings.kind === 'restore' ? 'Enter your purchase recovery code. It is sent only to the purchase service.' : `${settings.kind === 'monthly' ? '$9.99 USD/month' : '$199 USD lifetime'} nonfiction access. Applicable taxes and total appear in checkout. No trial.`
})
