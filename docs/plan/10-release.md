# Release runbook

How Cohere gets from `master` to an installed, self-updating app. Everything below is scripted;
this page explains what the scripts do and what they need. Companion: `07-distribution.md`
(design), `Makefile` at the repo root, `app/scripts/`.

## One-time setup on a release machine

| what | where it lives | how it got there |
|---|---|---|
| Developer ID Application certificate + private key | login keychain | Xcode → Settings → Accounts → Manage Certificates (already present) |
| Notarization credentials | keychain profile `cohere-notary` | `xcrun notarytool store-credentials cohere-notary --apple-id <email> --team-id <team>` with an **app-specific password** from appleid.apple.com. Rotate: delete the password on appleid.apple.com, generate a new one, run the command again. |
| Updater signing key (minisign) | keychain items `cohere-updater-key` (base64 of the key file) and `cohere-updater-key-password` | `tauri signer generate` once; the public half is `plugins.updater.pubkey` in `tauri.conf.json`. **If the private key is lost, installed copies can never update again** — keep the offline backup (`~/.tauri/cohere-updater-backup.txt` at generation time; move it to encrypted storage and delete the file). |
| GitHub | `gh auth login` (token in keychain) | repo `parislbp/cohere`, public; secret scanning + push protection enabled |
| git identity | `~/.gitconfig` | `user.email` is the GitHub noreply address so commits never carry a personal e-mail |
| tools | node 22, cargo, Xcode CLT, `gh`, `python3` | `make setup` installs node modules and the pre-commit secret scan |

Nothing secret is in the repository or in any file the scripts write. Scripts read the keychain
at run time (`security find-generic-password -w`) into environment variables of the build process.

## Identifiers that are public by design

The Team ID and the "Developer ID Application: …" name are embedded in every signed app and
readable with `codesign -dv`; they identify, they do not authenticate. The updater **public**
key is likewise meant to be public. What must stay private: the certificate's private key, the
app-specific password, the updater **private** key + its password, the GitHub token.

## Commands

```bash
make preflight                  # certificate · notary profile · updater key · tools · git/gh state
make build                      # signed + notarized + stapled DMG and updater archive → release/
make install                    # mount release/*.dmg, copy to /Applications, launch
make release VERSION=0.2.0      # everything below
make release VERSION=0.2.1 NOTES="Fixes the outline for \\part"   # writes docs/releases/v0.2.1.md for you
```

### What `make release VERSION=X.Y.Z` does, in order

1. **preflight** — fails fast if anything is missing; must be on `master`, in sync with `origin`.
2. **release notes** — `docs/releases/vX.Y.Z.md` must exist (or be given as `NOTES=`). This Markdown is
   the GitHub Release text, the entry in `CHANGELOG.md`, and what the in-app update dialog shows.
3. **bump** — `tauri.conf.json` (source of truth), `package.json` + lock, `Cargo.toml` + lock.
4. **check** — `npm run check`: typecheck, eslint, vitest, cargo test (`SKIP_CHECK=1` to skip).
5. **build** (`scripts/build.sh`)
   - `tauri build`: release profile (LTO, `opt-level = "s"`), signs the `.app` with the Developer ID,
     hardened runtime and a secure timestamp; writes `Cohere.app.tar.gz` + `.sig` (minisign, updater key
     from the keychain) because `bundle.createUpdaterArtifacts` is on; builds the DMG.
   - verifies `codesign --verify --deep --strict`, the Developer ID authority and the runtime flag,
     and that `CFBundleShortVersionString` equals the version.
   - `xcrun notarytool submit --wait` with the `cohere-notary` profile, then `xcrun stapler staple`
     and `spctl -a -t open`. (Tauri's own notarization is deliberately not used — it would need the
     app-specific password in an environment variable.)
   - copies DMG, archive, signature and `SHA256SUMS.txt` to `release/` (git-ignored).
6. **changelog + manifest** — prepends the notes to `CHANGELOG.md`; writes `latest.json`:
   ```json
   { "version": "X.Y.Z", "notes": "…", "pub_date": "…Z",
     "platforms": { "darwin-aarch64": { "signature": "<contents of .sig>",
       "url": "https://github.com/parislbp/cohere/releases/download/vX.Y.Z/Cohere.app.tar.gz" } } }
   ```
7. **secrets scan** over every tracked file.
8. **commit** `Release vX.Y.Z` (version bump + changelog + notes), **tag** `vX.Y.Z`, **push** both.
9. **GitHub Release** marked *latest*, with `cohere-X.Y.Z.dmg`, `Cohere.app.tar.gz`, `.sig`, `latest.json`,
   `SHA256SUMS.txt`. The README's download link is rewritten to the versioned DMG in the release commit.
10. **verify** that `…/releases/latest/download/latest.json` now serves the new version.

Links:
- download: `https://github.com/parislbp/cohere/releases/download/vX.Y.Z/cohere-X.Y.Z.dmg` (README always points at the newest)
- updater endpoint (in `tauri.conf.json`): `https://github.com/parislbp/cohere/releases/latest/download/latest.json`

## How an installed copy updates

At launch (after 2.5 s, if Settings › About › *Check for updates at launch* is on) the Rust side fetches
`latest.json`, compares `version` with its own, and — when newer — keeps the download description.
The dialog shows the notes; *install and relaunch* downloads the archive, verifies the minisign signature
with the embedded public key (a bad or missing signature aborts, nothing is replaced), extracts over
the running bundle and calls `AppHandle::restart`. Progress streams on the `update:progress` event.
Development builds (`make dev`) answer "development build" and never fetch; `COHERE_UPDATER_DEV=1`
overrides that for testing.

The updater-installed app is signed but not stapled; Gatekeeper fetches the ticket online if it ever asks.
Fresh installs from the DMG are stapled.

## Day-to-day

```
edit → make dev (or tdev in app/) → make check → git commit → git push
…when ready to ship: write docs/releases/vX.Y.Z.md → make release VERSION=X.Y.Z → make install
```

One branch (`master`), one commit per release carrying only the bump, tags `vX.Y.Z`.

## If something fails

| step | symptom | fix |
|---|---|---|
| preflight | `notarytool profile … rejected` (HTTP 403) | an Apple agreement needs accepting at developer.apple.com/account; wait a few minutes; re-run |
| build | `updater artefacts missing` | keychain items absent → restore from the offline backup with `security add-generic-password -a cohere -s cohere-updater-key -w "$(base64 -i key)"` and `… -s cohere-updater-key-password -w "<pw>"` |
| build | first `codesign` use pops a keychain dialog | click *Always Allow* once |
| notarize | `status: Invalid` | `xcrun notarytool log <id> --keychain-profile cohere-notary` — usually an unsigned nested binary or a missing timestamp |
| release | `tag already exists` / `release exists` | pick the next patch version; never reuse a tag |
| release | pushed but `gh release create` failed | `gh release create vX.Y.Z --notes-file docs/releases/vX.Y.Z.md release/*` by hand |
| app | update dialog shows a signature error | the `.sig` on GitHub does not match the `.tar.gz` — rebuild and re-upload the pair together |
