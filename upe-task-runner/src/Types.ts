import {
    PageObjectResponse,
    PropertyItemObjectResponse,
} from "@notionhq/client/build/src/api-endpoints";

export interface Env {
    // Example binding to KV. Learn more at https://developers.cloudflare.com/workers/runtime-apis/kv/
    // MY_KV_NAMESPACE: KVNamespace;
    //
    // Example binding to Durable Object. Learn more at https://developers.cloudflare.com/workers/runtime-apis/durable-objects/
    // MY_DURABLE_OBJECT: DurableObjectNamespace;
    //
    // Example binding to R2. Learn more at https://developers.cloudflare.com/workers/runtime-apis/r2/
    // MY_BUCKET: R2Bucket;
    useBinding: boolean;
    testing: boolean;
    workerUrl: string;
    NOTIONRESOLVER: Fetcher;
    NOTION_TOKEN: string;
    ADMIN_HOOK: string;
    MEMBERSHIP_HOOK: string;
    COMMS_HOOK: string;
    MARKETING_HOOK: string;
    SDMEDIA_HOOK: string;
    SOCIALNET_HOOK: string;
    TECH_HOOK: string;
    IR_HOOK: string;
    ENGAGEMENT_HOOK: string;
    CAREERDEV_HOOK: string;
    TEST_HOOK_1: string;
    TEST_HOOK_2: string;
    SECRET_TOKEN: string;
}

export enum Committee {
    Admin = "Admin",
    Communications = "Communications",
    Membership = "Membership",
    Marketing = "Marketing",
    SocialDigitalMedia = "Social & Digital Media",
    SocialNetworking = "Social & Networking",
    Technology = "Technology",
    IndustryRelations = "Industry Relations",
    StudentEngagement = "Student Engagement",
    CareerDevelopment = "Career Development",
}

export type DiscordConfig = {
    [key in Committee]: {
        webhook: string;
        roleId: string;
    };
};

interface AdditionalTaskAttributes {
    properties: Record<string, PropertyItemObjectResponse>;
    owningTeam: Committee;
    dueDate: string;
    status: Status;
    parentEvent: NotionTask;
    title: string;
    dueGroup: DueDate;
}

type Page = Omit<PageObjectResponse, "properties">;

export type NotionTask = Page & AdditionalTaskAttributes;

export type ComitteeTasks = {
    [key in Committee]?: GroupedTasks;
};

export type GroupedTasks = {
    [key in DueDate]?: NotionTask[];
};

export enum DueDate {
    PastDue = "PastDue",
    Today = "Today",
    Tomorrow = "Tomorrow",
    Upcoming = "Upcoming",
}

export enum Status {
    Completed = "Completed",
    InProgress = "In progress",
    NotStarted = "Not started",
}

export interface Resolver {
    (
        env: Env,
        request: Request,
        tasks: NotionTask[],
        useBinding: boolean,
        workerUrl: string
    ): Promise<any[]>;
}
