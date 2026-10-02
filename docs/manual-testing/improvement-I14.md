# I14 — Partial engineering handoff

**Stage I14 is incomplete.** Grok's ACP transport component is implemented; protected sign-in, funding/isolation, packaging and product account switching remain unfinished. There is no Grok connection to try. No assistant tests/checks/builds/launches or provider calls were performed.

As a user:

1. Open the [Grok component runbook](../ai/grok-runtime.md). The delivered transport and remaining authentication, funding, isolation, routing and packaging work are listed separately. The plan must not claim a working second provider or label permission alone as the remaining task.
2. If you want to check existing local continuity, launch the normal development app with `npm run dev` from the repository, with its dependencies already installed. Open **Settings → AI connections**. Expect the existing unavailable OpenAI/ChatGPT connection presentation; there is no Grok/Claude signup card or usable multi-provider selector.
3. In a disposable editable project, write a short synthetic paragraph, open the AI companion and switch between Conversation and Proofreading. Existing local capture/history and unavailable-generation explanations should remain available. No browser login, automatic send or provider change should occur from opening these views.
4. Close the companion and return to writing. The paragraph and existing local save behavior should remain intact. The transport work adds no project migration or external account requirement to local writing.

Please report any visible change or error with the action that preceded it. These local observations cannot establish Grok auth, streaming, cancellation, funding or packaging acceptance. Those scenarios await real protected integration and product controls; do not invoke raw IPC, edit gate code, copy tokens, install a CLI for a probe or exhaust an allowance to try to demonstrate billing behavior.

No user results are recorded yet. I13's more detailed [mechanics guide](improvement-I13.md) remains available; I14 does not replace its pending acceptance. Stop here before another stage.
