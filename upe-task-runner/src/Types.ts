import { PageObjectResponse, PropertyItemObjectResponse } from "@notionhq/client/build/src/api-endpoints";

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
    status: string;
    parentEvent: NotionTask;
    title: string;
    dueGroup: DueDate;
}

type Page = Omit<PageObjectResponse, "properties">;

export type NotionTask = Page & AdditionalTaskAttributes;

export type ComitteeTasks = {
    [key in Committee]?: GroupedTasks;
}

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
    NotStarted = "Not started"
}

export interface Resolver {
    (resolver: Fetcher, request: Request, tasks: NotionTask[], useBinding: boolean, workerUrl: string): Promise<any[]>;
}