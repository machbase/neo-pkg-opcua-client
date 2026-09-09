---
title: Server Settings
weight: 20
---

#

In OPC UA Client, the first thing to register is not the **OPC UA Server** but the **Database Server**.  
You need to decide where collected values will be stored before you can select a table and column in the job form.

## Open Server Settings

Open Server Settings from the left sidebar to see the list of registered Database Servers.

Available actions:

- `Add Server`
- `Edit`
- `Delete`
- `Connection Test`

![Database Server settings screen]({{< asset "images/opcua-server-settings.png" >}})

## Add a New Database Server

In most cases, you enter Machbase Neo connection information here.

Main input fields:

- `Name`
- `Host`
- `Port`
- `Database`
- `User`
- `Password`

Registration steps:

1. Click **Add Server**.
2. Enter the name, host, port, and account information.
3. Use **Load Databases** to select an available database, or type its name directly.
4. If possible, check the connection with **Connection Test** first.
5. Click **Save**.

The OPC UA Client writes collected data, so only a `READ_WRITE` database can be saved. You can type a database name even if loading the list fails, but Save checks the actual access permission and write mode again.

## Edit and Delete

- `Edit`
  - Updates the saved connection information.
- `Delete`
  - Removes the registered Database Server.

Be careful when deleting a server that is already used by a job, because it can affect future edits or restarts of that job.

## Notes

- The Database Server must work properly for the table and column lists to appear correctly.
- It is better to prepare the target table structure before creating a job.

## Navigation

- [Back to Index]({{< relref "/" >}})
- [Next: Create and Run Jobs]({{< relref "create-and-run-job" >}})
