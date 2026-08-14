// Atomic compare-and-set for the encrypted blob. Upstash REST is stateless (no
// WATCH/MULTI), so this script is the atomic unit: write only if the stored
// version still matches `expected`, so two tabs can't clobber each other.
//
// Blob = Redis hash with fields `c` (ciphertext), `v` (version). Returns:
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
