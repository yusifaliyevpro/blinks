"use client";

import { useEffect, useState } from "react";
import { getBlob } from "@/lib/actions";
import { clearSession, decryptJSON, loadSession } from "@/lib/crypto";
import type { LinkItem } from "@/lib/types";
import { LinksView } from "./links-view";
import { PasswordScreen, type Unlocked } from "./password-screen";

type Phase = { kind: "checking" } | { kind: "locked" } | ({ kind: "unlocked" } & Unlocked);

export function VaultApp() {
  const [phase, setPhase] = useState<Phase>({ kind: "checking" });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const session = await loadSession();
      if (!session) {
        if (!cancelled) setPhase({ kind: "locked" });
        return;
      }
      try {
        const blob = await getBlob(session.blobId);
        let links: LinkItem[] = [];
        let version = 0;

        if (blob) {
          links = await decryptJSON<LinkItem[]>(session.key, blob.ciphertext);
          version = blob.version;
        }

        if (!cancelled) {
          setPhase({ kind: "unlocked", session, links, version });
        }
      } catch {
        // Stored key no longer decrypts the blob — start over.
        clearSession();
        if (!cancelled) setPhase({ kind: "locked" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (phase.kind === "checking") {
    return <div className="min-h-full" aria-hidden="true" />;
  }

  if (phase.kind === "locked") {
    return <PasswordScreen onUnlock={(u) => setPhase({ kind: "unlocked", ...u })} />;
  }

  return (
    <LinksView
      session={phase.session}
      initialLinks={phase.links}
      initialVersion={phase.version}
      onLogout={() => {
        clearSession();
        setPhase({ kind: "locked" });
      }}
    />
  );
}
