# UPE Alumni Task "Bot"

This is a collection of cloudflare workers designed to run in tandem to execute notion API requests, retrieve the relevant tasks, and finally send messages to dedicated discord channels with a summary of the task statuses.

| Worker Project                                | Desctiption                                                                                                                                   |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| [bot-canary](/bot-canary/)                    | This is a canary that will both execute the task runner and report the status of the task to discord.                                         |
| [notion-task-resolver](notion-task-resolver/) | This is a worker used to batch resolve notion tasks to help remain under API request rate limits.                                             |
| [upe-task-runner](upe-task-runner/)           | The actually task runner that performs the fetch operations and transformations, as well as sending the messages to their respective channels |
