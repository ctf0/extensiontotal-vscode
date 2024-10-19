# 1.3.5

- remove `extensiontotal.apiKeySetting` as now we use vscode secret storage instead of plain key in the settings
- remove `extensiontotal.scanOnlyNewVersions` as now we only scan newly installed/updated to save api calls
- welcome webview now only showup if api key is not set
- when running the manual scan, you will get a modal if you want to scan (all extensions, not previously scanned)
- use esbuild to build ext for smaller size
- add a hint to `extensiontotal.scanEveryXHours` so `extensiontotal.scanOnStartup` actually works
