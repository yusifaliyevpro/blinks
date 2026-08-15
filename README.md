<h1>
  <img src="public/icon.svg" alt="" height="56" align="center" />
  Blinks
</h1>

Blinks is a private place to save links. Everything is encrypted inside your browser, and you can keep it on your device or store it remotely to reach from anywhere. You unlock it with one password. The server never sees your password or your links. It only ever holds a blob of bytes it cannot read.

See the [live demo](https://blinks-demo1.vercel.app/). It is for testing only; use your deployment or local setup for actual use.

## One password is the whole account

No sign up. No email. No username. No "forgot password" link.

Your password does two jobs at once: it is the **key** that encrypts your links, and it points to the **address** where they are stored. Type it and you open your vault. Type a different one and you get a different, empty vault. There is no "correct" password, because there is nothing on the server to check against.

So two things follow. Lose your password and the data is gone for good, since a reset would let someone in without it. And your password is the only lock, so anyone who has it can open your vault. Treat it like the master key it is.

To help, Blinks generates a 200 character random password in one click and copies it to your clipboard. That is far too much entropy to ever collide, and rate limiting rules out brute force.

> Note: This is a personal project to explore zero knowledge architecture, where the server truly cannot read your data. For a real product, I would also add email and 2FA, for security and for marketing and personalization.

## How it works

<p align="center">
  <img src="public/architecture.svg" alt="Blinks encrypts your links in the browser and sends only an opaque blob plus a write token to the server and Redis" width="920">
</p>

Step by step:

1. Your password and a fixed public salt go into Argon2id, a slow and memory heavy function. It returns a master secret.
2. HKDF splits that secret into three independent parts: `encKey` (an AES-256 key), `blobId` (a hex address), and `writeToken` (a write permit).
3. Your whole vault, its title and every link, gets gzipped, then encrypted as one payload with AES-256-GCM using `encKey`.
4. The browser sends `blobId`, the ciphertext, and `writeToken` to a server action.
5. The server validates the input, rate limits by IP, and writes the blob into Redis at `blobId`. It writes only if the version still matches (so two open tabs never overwrite each other) and only if the `writeToken` matches the one stored on the first write.

The point to notice: `encKey` never leaves the browser. The server and Redis only ever hold ciphertext. Even the number of links stays hidden, because the whole vault is one opaque blob.

### Why the write token

`blobId` is an address, and the browser sends it on every read, so on its own it is only a pointer, not a permission. If it ever leaked, someone could not read your links (they are encrypted), but they could try to overwrite or wipe the blob sitting at that address.

`writeToken` closes that gap. It is a third value from your password, independent of the key and the address. The server stores it on the first write and refuses any later write without a match, so an address alone can never change your data. It cannot decrypt anything, so storing it keeps the zero knowledge guarantee intact: the server still holds only bytes it cannot read.

## Local or remote: where your links live

Blinks can store the encrypted vault in two places, and you pick which on the password screen:

- **Local.** The blob is written to your browser's IndexedDB. It never leaves the device, works offline, and needs no server or database at all. Best for a single device, or if you don't want to run any backend.
- **Remote (Redis).** The blob is sent to the server and stored in Upstash Redis, so you can open the same vault from any device or browser by typing the same password.

Both use the same encryption, the same one-blob format, and the same write protection (version check plus write token). Only the destination changes, never how the data is secured.

Configure Redis credentials and the password screen shows a **Redis / Local** toggle (remembering your last choice across tabs). Leave Redis unconfigured and Blinks runs entirely local, with no toggle.

> One caveat: link previews (title and image) always fetch through the server, since a browser can't safely fetch arbitrary sites. In Local mode links still save offline; they just show the hostname until a preview loads.

## Tech stack

- Next.js 16 (App Router, React 19, React Compiler)
- TypeScript and Tailwind CSS v4
- Upstash Redis over REST (optional), with per IP rate limiting
- IndexedDB for the local, serverless storage option
- hash-wasm (Argon2id) and the Web Crypto API (AES-GCM, HKDF)

## The Encryption

- **Key derivation:** Argon2id (64 MB of memory, 3 passes). This makes guessing a password slow and expensive, even for someone holding the ciphertext.
- **Cipher:** AES-256-GCM with a fresh random IV on every write. GCM also verifies the data was not tampered with.
- **Key split:** HKDF-SHA256 with separate labels, so the storage address, the encryption key, and the write token stay independent.
- **Write authorization:** every write must carry `writeToken`, a third HKDF output that cannot decrypt anything; `blobId` alone only reads. See [Why the write token](#why-the-write-token).
- **No login to attack:** a wrong password lands on a different `blobId` (which is empty) or fails the GCM check. There is nothing to brute force, because there is no login step.

### A note on quantum

Blinks relies on symmetric crypto (AES and hashing). It does not use RSA or elliptic curve keys for the vault. That is exactly what matters for the quantum question.

Shor's algorithm breaks RSA and elliptic curve keys, and Blinks uses neither, so it has nothing for Shor to break. The best quantum attack on AES-256, Grover's algorithm, only halves the effective strength, leaving about 128 bits against a quantum computer. That is far past anything buildable.

So Blinks is **quantum-resistant**, though not "post-quantum". Post-quantum means new public key schemes built to survive quantum computers. Blinks takes a simpler road: it never uses the public key crypto they threaten.

## Setup

You need Node 20 or newer and pnpm.

1. Clone and install.

   ```bash
   git clone https://github.com/your-name/blinks.git
   cd blinks
   pnpm install
   ```

2. (Optional) Create a database in Upstash Redis. Make a free one at [upstash.com](https://upstash.com) and copy the REST credentials from its dashboard. Skip this if you only want the Local (in-browser) backend. Blinks runs fine with no Redis at all, it just won't offer the remote option.

3. Copy the example env file and fill it in.

   ```bash
   cp .env.example .env
   ```

   Read the comments in `.env.example`. Always set `NEXT_PUBLIC_KDF_SALT`: pick a long random string once and never change it, or your saved links stop opening. Generate one with:

   ```bash
   openssl rand -hex 32
   ```

4. Run it.

   ```bash
   pnpm dev
   ```

   Open [http://localhost:3000](http://localhost:3000) and type a password. That password is now your vault.

## Deploy

Blinks works fine locally, but to host it as a normal website, deploy anywhere that runs Next.js.

1. Push the repo to your Git host.
2. Point your host at the repo and build it.
3. Add the same environment variables from `.env`.
4. Make sure `NEXT_PUBLIC_KDF_SALT` matches the value you used locally, or your existing links will not open.

> NOTE:
> The per-IP rate limits read the client IP from a forwarded header. On Vercel that's `x-vercel-forwarded-for`, which the platform sets and clients can't spoof, so it works out of the box. On other hosts, put the header your proxy sets first in `IP_HEADERS` (`actions.ts`) and make sure the proxy overwrites any client value, or the IP is spoofable and the limits are bypassable.

## Good to know

- Your key and write token survive a page refresh but clear the moment you close the tab. They live in `sessionStorage`. Your last backend choice (Local or Remote) is remembered across tabs so the toggle starts where you left it.
- A Local vault is cleared if you wipe the browser's site data, so use Export to keep a backup (and Import to move it to another device).
- Some sites (often on Cloudflare) show a bot-check page (“Just a moment…”); for those Blinks falls back to the hostname. Previews succeed more often from your own machine, where the fetch uses your home IP, than from a deployed server. This is about where the app runs, not the Local/Remote choice: previews always fetch through the server either way.
- No tracking. No analytics. No third party scripts. The content security policy blocks outside scripts by design.

## License

AGPL-3.0-only © [Yusif Aliyev](https://yusifaliyevpro.com)
