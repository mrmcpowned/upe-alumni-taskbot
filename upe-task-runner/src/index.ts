import { Client } from "@notionhq/client";
import { DateTime, FixedOffsetZone, Interval, SystemZone, Zone } from "luxon";
import { chunk, groupBy, mapValues, max, pickBy, sortBy } from "lodash";
import { SelectPropertyItemObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import {
  CommitteeTasks,
  Committee,
  DiscordConfig,
  DueDate,
  Env,
  GroupedTasks,
  NotionTask,
  Resolver,
  Status,
} from "./Types";

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

const committees: DiscordConfig = {
  Admin: {
    webhook: "",
    roleId: [
      "746916839287947295", // Chapter Pres
      "746917575417397310" // Chapter VP
    ],
  },
  Membership: {
    webhook: "",
    roleId: "1062533969784078356",
  },
  Communications: {
    webhook: "",
    roleId: "1177934340399833138",
  },
  Marketing: {
    webhook: "",
    roleId: "1062731497066483833",
  },
  [Committee.SocialDigitalMedia]: {
    webhook: "",
    roleId: "1177933072902127646",
  },
  [Committee.SocialNetworking]: {
    webhook: "",
    roleId: "1141176986966970499",
  },
  Technology: {
    webhook: "",
    roleId: "1062521807250395176",
  },
  [Committee.Reach]: {
    webhook: "",
    roleId: [
      "746920914922242149", // Reach PM
      "881804508324306954" // Reach Committee
    ],
  },
  [Committee.Uplift]: {
    webhook: "",
    roleId: [
      "798305021007233074", // Uplift PM
      "1174489356610850857" // Uplift Committee
    ],
  },
  [Committee.Explore]: {
    webhook: "",
    roleId: [
      "746920050199494678", // Explore PM
      "1072980940172828783" // Explore Committee
    ],
  },
};

const isTrue = (value: string) => value === "true";

function setupEnvironment(env: Env) {
  env.useBinding = isTrue(env.useBinding as unknown as string);
  env.testing = isTrue(env.testing as unknown as string);
  committees[Committee.Admin].webhook = env.testing
    ? env.TEST_HOOK_1
    : env.ADMIN_HOOK;
  committees[Committee.Membership].webhook = env.testing
    ? env.TEST_HOOK_1
    : env.MEMBERSHIP_HOOK;
  committees[Committee.Communications].webhook = env.testing
    ? env.TEST_HOOK_1
    : env.COMMS_HOOK;
  committees[Committee.Marketing].webhook = env.testing
    ? env.TEST_HOOK_1
    : env.MARKETING_HOOK;
  committees[Committee.SocialDigitalMedia].webhook = env.testing
    ? env.TEST_HOOK_1
    : env.SDMEDIA_HOOK;
  committees[Committee.SocialNetworking].webhook = env.testing
    ? env.TEST_HOOK_2
    : env.SOCIALNET_HOOK;
  committees[Committee.Technology].webhook = env.testing
    ? env.TEST_HOOK_2
    : env.TECH_HOOK;
  committees[Committee.Reach].webhook = env.testing
    ? env.TEST_HOOK_2
    : env.IR_HOOK;
  committees[Committee.Uplift].webhook = env.testing
    ? env.TEST_HOOK_2
    : env.ENGAGEMENT_HOOK;
  committees[Committee.Explore].webhook = env.testing
    ? env.TEST_HOOK_2
    : env.CAREERDEV_HOOK;
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    if (request.clone().headers.get("x-custom-token") !== env.SECRET_TOKEN) {
      return new Response("Invalid Auth", { status: 401 });
    }

    const notion = new Client({
      auth: env.NOTION_TOKEN,
    });

    // console.log(env.NOTIONRESOLVER);

    setupEnvironment(env);

    try {
      const taskResolver = batchResolveTasks(
        env,
        request,
        env.useBinding,
        env.workerUrl
      );

      const upcomingEvents = (
        await notion.databases.query({
          database_id: "b42e8533001d43e7a32e8f2788fd548e",
          filter: {
            and: [
              {
                property: "Type",
                multi_select: {
                  contains: "Event",
                },
              },
              {
                or: [
                  {
                    property: "Date",
                    date: {
                      next_month: {},
                    },
                  },
                  {
                    property: "Date",
                    date: {
                      past_week: {}
                    }
                  }
                ]
              }
            ],
          },
        })
      ).results as NotionTask[];

      const pages = (await taskResolver(upcomingEvents)).map((e) => ({
        ...e,
        title:
          e.properties["Name"].results[0]?.title.plain_text ?? "Missing Title",
        owningTeam: e.properties["Type"].multi_select.filter(
          (t: SelectPropertyItemObjectResponse["select"]) => t?.name !== "Event"
        )[0].name,
      }));

      // console.log(pages);

      const events = mapValues(groupBy(pages, "id"), (e) => e[0]);

      const pageIds = Object.keys(events);

      const pageDatabases = pageIds.map((id) =>
        (async () =>
        (events[id].database = (
          await notion.blocks.children.list({
            block_id: id,
          })
        ).results.filter((b) => b.type === "child_database")[0]))()
      );

      await Promise.all(pageDatabases);

      for (let eventId in events) {
        console.log(eventId);
        if (!events[eventId]?.database)
        {
          throw Error(`Unable to find database for '${events[eventId].title}'! Please check it's not nested in another block!`)
        }
      }

      const eventByDb = mapValues(
        groupBy(
          pages.filter((p) => p.database),
          "database.id"
        ),
        (e) => e[0]
      );

      // console.log(eventByDb);

      // console.log("Resolved pages", JSON.stringify(pages, undefined, 2));

      // Get all tasks from each database

      const upcomingTasks = Object.keys(events)
        .map((e) => events[e].database?.id)
        .filter((id) => id)
        .map((id) =>
          notion.databases
            .query({
              database_id: id,
              filter: {
                and: [
                  {
                    property: "Due Date",
                    formula: {
                      date: {
                        on_or_before: DateTime.now()
                          .plus({
                            days: DateTime.now().weekday == 1 ? 14 : 7,
                          })
                          .toISO(),
                      },
                    },
                  },
                  {
                    property: "Due Date",
                    date: {
                      on_or_after: DateTime.now().toISO(),
                    },
                  },
                ],
              },
            })
            .then((response) => response.results)
        );

      // console.log(
      //     Object.keys(events)
      //         .map((e) => events[e].database?.id)
      //         .filter((id) => id)
      // );

      // console.log("events: ", events);

      const pastDueTasks = Object.keys(events)
        .map((e) => events[e].database?.id)
        .filter((id) => id)
        .map((id) =>
          notion.databases
            .query({
              database_id: id,
              filter: {
                and: [
                  {
                    property: "Due Date",
                    formula: {
                      date: {
                        before: DateTime.now().toISO(),
                      },
                    },
                  },
                  {
                    property: "Due Date",
                    formula: {
                      date: {
                        on_or_after: DateTime.now().minus({ weeks: 1 }).toISO(),
                      },
                    },
                  },
                ],
              },
            })
            .then((response) => response.results)
        );

      // console.log("pastDueTasks: ", events);

      const tasks = (
        await Promise.all([...pastDueTasks, ...upcomingTasks])
      ).flat() as NotionTask[];

      console.log("Past due tasks count: ", pastDueTasks.length);
      console.log("Upcoming tasks count: ", upcomingTasks.length);

      const tasksWithProperties = (await taskResolver(tasks))
        .flat()
        .map((t) => ({
          ...t,
          owningTeam:
            t.properties["Type"].select?.name ??
            t.properties["Type"].multi_select?.[0].name ??
            null,
          dueDate: t.properties["Due Date"].formula?.date?.start ?? eventByDb[t.parent.database_id].properties["Date"],
          status: t.properties["Status"].status?.name ?? Status.NotStarted,
          parentEvent: eventByDb[t.parent.database_id],
          title:
            t.properties["Name"].results[0]?.title.plain_text ?? "Missing Title",
          assignedTo: t.properties["Assign"].results[0]?.people,
        }))
        .map((t) => ({
          ...t,
          dueGroup: dueGroup(t.dueDate),
          owningTeam:
            t.owningTeam == "Initiative"
              ? t.parentEvent.owningTeam
              : t.owningTeam,
        }))
        .filter(
          (task) =>
            !(task.status == Status.Completed && task.dueGroup == DueDate.PastDue)
        ) as NotionTask[];

      console.log("Tasks with properties count: ", tasksWithProperties.length);

      // Group tasks by assigned committee

      const teamGroupedTasks = groupBy(tasksWithProperties, "owningTeam");

      const teamAndDueGroupedTasks = mapValues(teamGroupedTasks, (tasks) =>
        mapValues(groupBy(tasks, "dueGroup"), (taskGroup: NotionTask[]) =>
          sortBy(taskGroup, [(task) => DateTime.fromISO(task.dueDate)])
        )
      );

      console.log("Due grouped tasks", Object.keys(teamAndDueGroupedTasks).map(k => ({
        team: k,
        dues: Object.keys(teamAndDueGroupedTasks[k]).map(d => ({
          dueGroup: d,
          numDue: teamAndDueGroupedTasks[k][d].length,
          dueDates: teamAndDueGroupedTasks[k][d].map(d => d.dueDate)
        }))
      })));

      // for each comittee
      // - Past Due Tasks
      // Event Name - Task Name
      // - Tasks Due Today
      // Event Name - Task Name
      // - Tasks Due soon (ordered by due date)

      const pingableTeamsAndTasks = pickBy(
        teamAndDueGroupedTasks,
        (v) => pingMessages(v).length
      );

      console.log(
        "pingableTeamsAndTasks keys: ",
        Object.keys(pingableTeamsAndTasks)
      );

      await sendWebhooks(pingableTeamsAndTasks, env.testing);

      return new Response(JSON.stringify(pingableTeamsAndTasks, undefined, 2));
    }
    catch (e) {
      let message: string = [e?.message || '', e?.stack || ''].join("\n");
      message = (message.length > 2000) ? message.substring(0, 2000) : message;
      await fetch(env.LOG_HOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "🤖 Task Bot Canary",
          avatar_url:
            "https://cdn.discordapp.com/icons/825566580922122240/86a4f047ac47ca24ae7c805be2bac514.webp?size=96",
          content: message
        }),
      });
    }
  },
};

function dueGroup(date: string) {
  const dueDate = DateTime.fromISO(date).startOf("day");
  const today = DateTime.now().startOf("day");
  const tomorrow = today.plus({ days: 1 });

  if (dueDate < today) {
    return DueDate.PastDue;
  } else if (dueDate.hasSame(today, "day")) {
    return DueDate.Today;
  } else if (dueDate.hasSame(tomorrow, "day")) {
    return DueDate.Tomorrow;
  } else {
    return DueDate.Upcoming;
  }
}

function taskText(task: NotionTask) {
  const eventTitle = task.parentEvent.title;

  const taskTitle = task.title;
  const taskDate = DateTime.fromISO(task.dueDate).toRelativeCalendar();

  const { status, url, icon } = task;

  return `**${status}**, *due ${taskDate}* | [[*${eventTitle}*] **${icon?.emoji} ${taskTitle}**](${url})`;
}

function messageText(tasks: GroupedTasks) {
  const important = (t: string) => `‼${t}`;
  const indent = (t: string) => `> ${t}`;

  const pastDueItems =
    tasks.PastDue?.map(taskText).map(important).map(indent).join("\n") ??
    "🥳 No Tasks Past Due";

  const dueTodayItems =
    tasks.Today?.map(taskText).map(indent).join("\n") ??
    "😎 No Tasks Due Today";

  const tomorrowItems =
    tasks.Tomorrow?.map(taskText).map(indent).join("\n") ??
    "👀 No Tasks Due Tomorrow";

  const upcomingItems =
    tasks.Upcoming?.map(taskText).map(indent).join("\n") ??
    "😴 No Upcoming Tasks";

  const messageText = [
    ["**__Past Due__**", pastDueItems].join("\n"),
    ["**__Due Today__**", dueTodayItems].join("\n"),
    ["**__Due Tomorrow__**", tomorrowItems].join("\n"),
    ["**__Upcoming Tasks__**", upcomingItems].join("\n"),
  ];

  return messageText.join("\n\n");
}

export const statusSort = [
  Status.NotStarted,
  Status.InProgress,
  Status.Completed,
];

function sendWebhooks(comitteeTasks: CommitteeTasks, testing: boolean) {
  const discordWebhooks = Object.entries(comitteeTasks).map(
    ([committee, taskGroups]) => {
      const {roleId, webhook} = committees[committee as Committee]
      const roleIds = Array.isArray(roleId) ? roleId : [roleId];
      return (
        fetch(webhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: "🤖 Task Bot",
            avatar_url:
              "https://cdn.discordapp.com/icons/825566580922122240/86a4f047ac47ca24ae7c805be2bac514.webp?size=96",
            // content: pingMessages(taskGroups).join("\n"),
            content: [
              testing
                ? null
                : roleIds.map(id => `<@&${id}>`).join(" "),
              pingMessages(taskGroups).join("\n"),
            ].join("\n"),
            embeds: [
              {
                title: `Tasks Overview for '${committee}'`,
                description: messageText(taskGroups),
              },
            ],
          }),
        })
          // .then(async (r) => ({ r: await r.json(), h: r.headers }))
          // .then(({ r, h }) => console.log(committee, " \n", h, "\n", r))
          .catch((error) => new Response(error, { status: 500 }))
      );
    }
  );

  return Promise.all(discordWebhooks);
}

const resolveBatcher: Resolver = (
  env,
  request,
  tasks,
  useBinding,
  workerUrl
) => {
  // Find largest number of properties
  const maxProps = max(tasks.map((t) => Object.keys(t.properties).length)) ?? 0;
  // Multiply value by num of requests to get calls
  const totalCalls = maxProps * tasks.length;
  // Divide num of calls by 50, get ceil
  const batches = Math.ceil(totalCalls / 50);
  // Divide num of tasks by batch val
  const chunkSize = Math.floor(tasks.length / batches);

  return Promise.all(
    chunk(tasks, chunkSize).map((taskGroup) => {
      const url = useBinding ? request.clone().url : workerUrl;

      let newRequest = new Request(url, {
        ...request.clone(),
        method: "POST",
        body: JSON.stringify(taskGroup),
      });

      newRequest.headers.set("Content-Type", "application/json");
      newRequest.headers.set("x-custom-token", env.SECRET_TOKEN);

      // console.log("Bind: ", useBinding);
      // console.log("workerUrl: ", workerUrl);

      return env.NOTIONRESOLVER.fetch(newRequest)
        .then((r) => r.json())
        .catch((error) => new Response(error, { status: 500 }));
    })
  ).then((t) => t.flat());
};

function batchResolveTasks(
  env: Env,
  request: Request,
  useBinding: boolean,
  workerUrl: string
) {
  return (tasks: NotionTask[]): Promise<any[]> =>
    resolveBatcher(env, request, tasks, useBinding, workerUrl);
}

const pingMessages = (taskGroups: GroupedTasks) => {
  const messages = [];

  const isNotCompleted = (t: NotionTask) => !(t.status == Status.Completed);
  const isNotInProgress = (t: NotionTask) => !(t.status == Status.InProgress);

  //It's Monday
  if (DateTime.now().setZone("UTC-7").weekday == 1) {
    messages.push(
      "It's Monday! Below are the list of tasks due with a 2 week lookahead."
    );
  }

  // Item Past Due
  if (taskGroups.PastDue?.length) {
    messages.push(
      "There are tasks that are **__past due__** and not marked as completed."
    );
  }
  // Item Due Today
  if (
    taskGroups.Today?.length &&
    taskGroups.Today.filter(isNotCompleted).length
  ) {
    messages.push(
      "There are tasks **due today** that are not marked as completed."
    );
  }
  // Item Due Tomorrow
  if (
    taskGroups.Tomorrow?.length &&
    taskGroups.Tomorrow.filter(isNotInProgress).length
  ) {
    messages.push(
      "There are tasks *due tomorrow* that are not marked as in progress."
    );
  }

  return messages;
};
