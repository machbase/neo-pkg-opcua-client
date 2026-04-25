---
title: Monitoring and Logs
weight: 40
---

# Monitoring and Logs

## Items Shown on the Dashboard

When you select a job, the detail area on the right shows the following information.

- Job name
- Current status (`running` / `stopped`)
- OPC UA endpoint
- Interval / Read Retry Interval
- Number of Nodes Monitored
- Last Updated At
- Database Server / Table / Column
- Logging Controls
- Live Logs

![Job detail screen](./images/opcua-job-detail.png)

## Status Meanings

- `running`
  - Data is being collected.
- `stopped`
  - Data collection is stopped.

Additional status hints:

- `Disconnected`
  - A connection problem with the OPC UA server is suspected.
- `Stale`
  - The server is reachable, but recent updates are old.

These may appear as badges in the OPC UA card at the top of the dashboard.

## Nodes Monitored

The middle card shows the number of nodes currently being monitored.

Information shown together:

- The last collection time
- A human-readable relative time

If collection appears to have stopped for too long, check the endpoint connection and interval settings first.

## Monitored Nodes List

The table in the lower area shows the currently registered nodes.

Main columns:

- `Tag Name`
- `Node ID`
- `Transform`

Available actions in the UI:

- Filter by name or Node ID
- Sort

## Logging Controls

The lower part of the detail screen shows a summary of the current job's log settings.

- `Log Level`
- Included log level guidance
- `File Limit`
- `View Logs`

## Live Logs

If you scroll down in the detail screen, you will find the **Live Logs** card.  
If you only look at the top summary cards, it may not be visible right away, so scroll down when needed.

Characteristics of Live Logs:

- It does not replay the full old log history. It follows only newly generated log lines.
- The panel may appear empty if there are no recent new logs.
- The panel may also appear empty or minimal when the log level is restrictive, such as `WARN` or `ERROR`.

Available actions in the UI:

- `Pause`
- `Clear`

For reviewing older log history, **View Logs** is more suitable.

## Open Log Files

Click **View Logs** in the Logging Controls area to open the log file list for the current job.

## Log File List

The first screen shows the list of log files related to that job.

Typical items to check:

- File name
- File size

If older rotated log files remain, they may also appear in the list.

![Log file viewer screen](./images/opcua-log-viewer.png)

## View Log File Contents

After selecting a file, you can view its log content.

## Recommended Check Order During Operation

1. Check whether the job is `running`.
2. Check whether `Last Updated At` is recent.
3. Check whether the number of `Nodes Monitored` matches expectations.
4. Check whether the Database Server, Table, and Column are correct.
5. Check current activity in Live Logs near the bottom of the screen.
6. If needed, use View Logs to inspect detailed causes.

## Navigation

- [Previous: Create and Run Jobs](./create-and-run-job.en.md)
- [Back to Index](./index.en.md)
- [Next: Troubleshooting](./troubleshooting.en.md)
