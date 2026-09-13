# Frontend Releases

The original `/opt/veriflow/apps/web` build remains available for rollback.
Never run `next build` in the active systemd working directory.

1. Archive the exact commit's `apps/web` tree with `git archive`. Upload it as
   `/tmp/veriflow-<full-sha>.tar.gz` and upload `web-release.sh` with LF endings.
2. Run `web-release.sh build <full-sha>` in a transient systemd unit with
   `CPUQuota=80%`, `MemoryMax=1G`, `MemorySwapMax=512M`, `TasksMax=64` and
   `RuntimeMaxSec=900`. The build uses one Next.js worker and a 512 MB JS heap.
   The script intentionally fails if dependency lockfiles differ; install changed
   dependencies into the release itself before adapting the release procedure.
3. Check the unit exit result and release `READY` file. A missing marker means
   failure; keep the existing website running and inspect the build journal.
4. Run `web-release.sh activate <full-sha>`. The service changes working directory
   only after a successful build. Failed startup probes restore the prior override.
5. Verify public login, authenticated history, graphs, algorithms and architecture,
   including JavaScript/CSS responses. Preserve the original build and prior release.

Only `veriflow-web` is restarted. Database, API configuration and nginx stay intact.
