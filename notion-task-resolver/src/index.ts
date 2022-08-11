/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `wrangler dev src/index.ts` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `wrangler publish src/index.ts --name my-worker` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import { Client } from "@notionhq/client";
import { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import { groupBy, mapValues, merge } from "lodash";

export interface Env {
    // Example binding to KV. Learn more at https://developers.cloudflare.com/workers/runtime-apis/kv/
    // MY_KV_NAMESPACE: KVNamespace;
    //
    // Example binding to Durable Object. Learn more at https://developers.cloudflare.com/workers/runtime-apis/durable-objects/
    // MY_DURABLE_OBJECT: DurableObjectNamespace;
    //
    // Example binding to R2. Learn more at https://developers.cloudflare.com/workers/runtime-apis/r2/
    // MY_BUCKET: R2Bucket;
    NOTION_TOKEN: string;
}

export default {
    async fetch(
        request: Request,
        env: Env,
        ctx: ExecutionContext
    ): Promise<Response> {
        const tasks: PageObjectResponse[] = await request.json();

        const notion = new Client({
            auth: env.NOTION_TOKEN,
        });

        const propsToResolve = tasks
            .map(({ id, properties }) => ({
                page_id: id,
                properties,
            }))
            .flatMap(({ page_id, properties }) =>
                Object.entries(properties).map(([property_name, prop]) => ({
                    page_id,
                    property_id: prop.id,
                    property_name,
                }))
            )
            .map(({ property_name, ...restOfProps }) =>
                notion.pages.properties
                    .retrieve({
                        ...restOfProps,
                    })
                    .then((resolvedProp) => ({
                        ...resolvedProp,
                        page_id: restOfProps.page_id,
                        property_name,
                    }))
                    .catch(error => console.log(error))
            );

        const resolvedProps = await Promise.all(propsToResolve);

        const groupedProps = groupBy(resolvedProps, "page_id");

        const expandedTasks = tasks.map((task) =>
            merge({}, task, {
                properties: mapValues(
                    groupBy(groupedProps[task.id], "property_name"),
                    (p) => p[0]
                ),
            })
        );

        return new Response(JSON.stringify(expandedTasks, undefined, 2));
    },
};
