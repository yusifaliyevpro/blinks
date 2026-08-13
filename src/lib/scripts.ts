// Atomic compare-and-set for the encrypted blob.
//
// Upstash's REST API is stateless, so there's no WATCH/MULTI session to hold a
// read and a write together. This tiny server-side script is the atomic unit
// instead: it reads the stored version and only writes (bumping the version) if
// it still matches `expected`. Two tabs can therefore never clobber each other.
//
// The blob is a Redis hash with two fields: `c` (ciphertext), `v` (version).
//
// Return value (a plain array, no JSON string building):
//   success  -> ["ok", newVersion]
//   conflict -> ["conflict", currentVersion, currentCiphertext | null]
export const PUT_BLOB_CAS = `
local key = KEYS[1]
local expected = tonumber(ARGV[2])
local current = tonumber(redis.call('HGET', key, 'v')) or 0

if current ~= expected then
  return { 'conflict', current, redis.call('HGET', key, 'c') }
end

local next = current + 1
redis.call('HSET', key, 'c', ARGV[1], 'v', next)
return { 'ok', next }
`;

export type CasResult = ["ok", number] | ["conflict", number, string | null];
