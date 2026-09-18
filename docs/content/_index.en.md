---
title: OPC UA Client User Manual
weight: 10
---

This manual explains how to read OPC UA values with the **Machbase Neo OPC UA Client package**, store them in a Machbase Database, and inspect the results.

## Installation

On the Machbase Neo package screen, select OPC UA Client and click `Install`. Open the package after installation finishes.

> Check the package name and installation status. Exact version numbers shown by Neo depend on the release being installed.

## Basic Workflow

1. Install the OPC UA Client package.
2. Register and test the **Database Server** that will store collected values.
3. Register and test the **OPC UA Server** that provides the values.
4. Open `New Job` and create a job.
5. Select an existing time-based TAG table or enter a new table name.
6. Add nodes manually or select them in the Node Browser.
7. Configure Transform, Derived Tags, and Collection Policy when needed.
8. Start the job and check the Dashboard and logs.
9. Inspect stored values as a Raw table or Chart in `Data Viewer`.

## Screen Layout

![OPC UA Client collecting real test data](/images/app-overview-running.png)

- Left sidebar
  - Job list and run switches
  - `New Job`
  - `Server Settings`: Database Server management
  - `OPC UA Servers`: OPC UA connection profile management
- Main area
  - Status, nodes, derived tags, storage, and policies for the selected job
  - `Live Logs`, `Data Viewer`, `Edit`, and `Delete`
- Settings dialogs
  - Database Servers, OPC UA Servers, certificates, and saved logs

## Documents

- [Server Settings]({{< relref "server-settings" >}})
- [Create and Run Jobs]({{< relref "create-and-run-job" >}})
- [Monitoring and Logs]({{< relref "monitoring-and-logs" >}})
- [Data Viewer]({{< relref "data-viewer" >}})
- [Troubleshooting]({{< relref "troubleshooting" >}})

## Navigation

- [Next: Server Settings]({{< relref "server-settings" >}})
