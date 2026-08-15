import { VaultApp } from "@/components/vault-app";
import { redisAvailable } from "@/lib/env.server";

export default function Home() {
  return (
    <main className="min-h-full">
      <VaultApp redisAvailable={redisAvailable} />
    </main>
  );
}
