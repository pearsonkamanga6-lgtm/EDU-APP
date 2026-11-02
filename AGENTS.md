<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## EduSend
- EduSend is the original vanilla-JS app kept as-is in `public/edusend/` and served as raw HTML by `src/routes/index.tsx`; why: faithful port of a 1000+ line script app without a rewrite.
- All `/api/*` calls go through `src/routes/api/$.ts`, which runs the ported server logic in `src/server/edusend-core.ts`; each browser workspace (cookie) is one JSON row in Lovable Cloud, accessed only server-side; why: keeps the original workspace-per-device model.
- Screenshot/photo reading uses the AI gateway (`/api/screenshot-extract`) first and falls back to the on-device reader; why: much higher accuracy for names and marks.
