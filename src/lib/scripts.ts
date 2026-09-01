// Atomic compare-and-set for the encrypted blob (Upstash REST has no WATCH/MULTI,
// so this Lua script is the atomic unit): overwrite only if `v` still matches
// `expected` and the presented write token matches the stored `t`. A new blob
// adopts the presented token on first write, so a leaked blobId (a bearer read id)
// can't clobber the vault and two tabs can't race. `t` is never returned.
//
// Blob = Redis hash: `c` (ciphertext), `v` (version), `t` (writeToken). Returns:
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
