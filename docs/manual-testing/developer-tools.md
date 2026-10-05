Developer tools correction complete. As a user:

1. When I quit the current app normally, stop the old development process if it remains running, and run `npm run dev` from this repository, Collie Writer opens again with the updated main-process code.
2. When I choose **Development → Open developer tools**, the DevTools interface appears and the terminal no longer reports `ERR_BLOCKED_BY_CLIENT` for `devtools://devtools/bundled/devtools_app.html`.
3. When I select **Console** and **Elements**, both panels render. When I close DevTools and open it again from the same menu, it reopens and the writing workspace remains available.

**Implementation complete — awaiting user testing.** Report any remaining warning and which step failed. The assistant has not launched the app or run checks.
