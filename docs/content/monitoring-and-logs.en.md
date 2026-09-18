---
title: Monitoring and Logs
weight: 40
---

## Check the Dashboard

Select a job in the left sidebar to see its current configuration and status.

![Job Dashboard while collecting real test data](/images/job-detail-running.png)

The top area shows:

- Job name and `Running` or `Stopped` status
- OPC UA Server, Interval, and Read Retry Interval
- Counts for source `Nodes` and `Derived` Tags
- Last collection time
- Database Server, Table, and Value Column

The lower area provides:

- Monitored Nodes: Tag Name, Node ID/Path, Data Type, and Transform
- Derived Tags: expression, variables, Base Time, and error action
- Collection Policy: Time Policy and Bad Status Policy
- Logging Controls: Log Level, File Limit, and `View Logs`

## Status Meanings

- `Running`: the job is collecting data.
- `Stopped`: collection is stopped.
- `Disconnected`: the job has not collected recently and the OPC UA connection test also failed.
- `Stale`: the OPC UA Server is reachable, but the last collection time is old.

`Disconnected` and `Stale` may appear after a running job has not collected for more than three times its configured Interval and the UI checks the connection.

## Job Action Restrictions

`Edit` and `Delete` are disabled while a job is `Running`. Stop it with the switch in the left sidebar before changing its configuration or removing it.

`Data Viewer` is disabled for a job that uses a JSON Value Column. See [Data Viewer]({{< relref "data-viewer" >}}) for the reason.

## Live Logs

Live Logs is not a fixed card at the bottom of the Dashboard. Use the **`Live Logs` button in the page header** to open and close the live log window.

![Live Logs showing actual collection activity](/images/live-logs-running.png)

- `CONNECTED`: the live log connection is open
- `Pause`: temporarily stop displaying new lines
- `Clear`: remove lines currently displayed in the window

Live Logs follows lines produced after the connection opens. It does not replay the complete history. The window may be empty when there are no new messages or when the Log Level is limited to `WARN` or `ERROR`.

## View Saved Logs

Click `View Logs` in the Dashboard's Logging Controls.

![Saved Log Viewer showing a stored log file](/images/saved-log-viewer.png)

1. Check the file name and size in the current job's log file list.
2. Select a file to read its contents.
3. Older rotated files appear in the same list when they are still retained.

Saved logs are better than Live Logs for investigating an earlier failure.

## Recommended Check Order

1. Confirm that the job is `Running`.
2. Confirm that the last collection time is recent.
3. Check the OPC UA card for `Disconnected` or `Stale`.
4. Check that the Nodes and Derived counts match expectations.
5. Verify the Database, Table, Column, and Collection Policy.
6. Open `Live Logs` from the header to watch current activity.
7. Use `View Logs` to investigate earlier errors when needed.

## Navigation

- [Previous: Create and Run Jobs]({{< relref "create-and-run-job" >}})
- [Back to Index]({{< relref "/" >}})
- [Next: Data Viewer]({{< relref "data-viewer" >}})
