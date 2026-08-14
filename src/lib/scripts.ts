// Atomic compare-and-set for the encrypted blob. Upstash REST is stateless (no
// WATCH/MULTI), so this script is the atomic unit: write only if the stored
// version still matches `expected`, so two tabs can't clobber each other.
//
// Write authorization: the blob stores a `t` (write token) derived from the
// password. An existing blob may only be overwritten by a request presenting the
// matching token, so knowing the blobId alone (a bearer id, sent on every read)
// is not enough to corrupt or wipe the vault. The token is never returned to
// clients. A brand-new blob (no stored `t`) adopts the presented token on first
// write, which also transparently upgrades pre-existing token-less blobs.
//
// Blob = Redis hash with fields `c` (ciphertext), `v` (version), `t` (writeToken).
// Returns:
//   success      -> ["ok", newVersion]
//   conflict     -> ["conflict", currentVersion, currentCiphertext | null]
//   unauthorized -> ["unauthorized"]
export const PUT_BLOB_CAS = `
local key = KEYS[1]
local ciphertext = ARGV[1]
local expected = tonumber(ARGV[2])
local token = ARGV[3]
local current = tonumber(redis.call('HGET', key, 'v')) or 0
local storedToken = redis.call('HGET', key, 't')

if storedToken and storedToken ~= token then
  return { 'unauthorized' }
end

if current ~= expected then
  return { 'conflict', current, redis.call('HGET', key, 'c') }
end

local next = current + 1
redis.call('HSET', key, 'c', ciphertext, 'v', next, 't', token)
return { 'ok', next }
`;

export type CasResult = ["ok", number] | ["conflict", number, string | null] | ["unauthorized"];
