"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Shell from "@/components/Shell";
import { api, VerifySession } from "@/lib/api";
import VerificationConsole from "@/components/VerificationConsole";

export default function StoredRunPage() {
  const params = useParams<{ id: string }>();
  const [error, setError] = useState("");
  const [session, setSession] = useState<VerifySession | null>(null);

  useEffect(() => {
    api
      .reportRun(Number(params.id))
      .then(setSession)
      .catch((err: Error) => setError(err.message));
  }, [params.id]);

  return (
    <Shell>
      <main className="page vf-page">
        <header className="page-head tight">
          <h1>Run #{params.id}</h1>
          <p className="lead">已保存的验证记录，刷新后仍可查看。</p>
        </header>
        {error ? <p className="err">{error}</p> : null}
        {error ? null : session ? <VerificationConsole initialSession={session} /> : <p className="ghost">加载验证记录…</p>}
      </main>
    </Shell>
  );
}
