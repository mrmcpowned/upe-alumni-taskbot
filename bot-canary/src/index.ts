import { CommitteeTasks } from "../../upe-task-runner/src/Types";

/**
 * Welcome to Cloudflare Workers! This is your first scheduled worker.
 *
 * - Run `wrangler dev --local` in your terminal to start a development server
 * - Run `curl "http://localhost:8787/cdn-cgi/mf/scheduled"` to trigger the scheduled event
 * - Go back to the console to see what your worker has logged
 * - Update the Cron trigger in wrangler.toml (see https://developers.cloudflare.com/workers/wrangler/configuration/#triggers)
 * - Run `wrangler publish --name my-worker` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/runtime-apis/scheduled-event/
 */

export interface Env {
    // Example binding to KV. Learn more at https://developers.cloudflare.com/workers/runtime-apis/kv/
    // MY_KV_NAMESPACE: KVNamespace;
    //
    // Example binding to Durable Object. Learn more at https://developers.cloudflare.com/workers/runtime-apis/durable-objects/
    // MY_DURABLE_OBJECT: DurableObjectNamespace;
    //
    // Example binding to R2. Learn more at https://developers.cloudflare.com/workers/runtime-apis/r2/
    // MY_BUCKET: R2Bucket;
    SECRET_TOKEN: string;
    CANARY_HOOK: string;
    BOT_URL: string;
}

export default {
    async scheduled(
        controller: ScheduledController,
        env: Env,
        ctx: ExecutionContext
    ): Promise<void> {
        const req = new Request(env.BOT_URL, {
            method: "GET",
            headers: {
                "x-custom-token": env.SECRET_TOKEN,
            },
        });

        let error;

        const res: CommitteeTasks = await fetch(req)
            .then((r) => r.json<CommitteeTasks>())
            .catch((err) => (error = err));

        await fetch(env.CANARY_HOOK, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: "🤖 Task Bot Canary",
                avatar_url:
                    "https://cdn.discordapp.com/icons/825566580922122240/86a4f047ac47ca24ae7c805be2bac514.webp?size=96",
                content: error
                    ? "There was an error sending the tasks: " + error
                    : "Sucessfully sent tasks for these teams: \n\n" + Object.keys(res).join("\n"),
            }),
        });
    },
};
