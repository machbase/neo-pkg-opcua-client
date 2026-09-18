---
title: Create and Run Jobs
weight: 30
---

## Create a Job

Click `New Job` in the left sidebar. The current form is arranged in this order:

![New Job form with server profiles and an existing table selected](/images/job-form-existing-table.png)

1. Job
2. OPC UA Server and Database
3. Node Mapping
4. Derived Tags
5. Collection Policy
6. Logging Controls

## Job and OPC UA Server

Enter a job name in `Name`. Letters, numbers, `_`, and `-` are allowed.

In `OPC UA Server`, select a profile registered in [Server Settings]({{< relref "server-settings" >}}). A `Legacy endpoint` may appear only when editing an older configuration. New jobs use a server profile instead of entering an Endpoint URL directly.

- `Interval (ms)`: the collection interval, with a minimum of 1,000ms
- `Read Retry Interval (MS)`: how long to wait before retrying after a read failure

## Database and Table

Select a `Database Server`, then select or enter a Table name. The collector writes collection time into the TAG table's base column, so it supports **time-based TAG tables only**. Distance-based TAG tables are removed from the list and cannot be saved even when typed directly.

### Use an Existing Table

Selecting an existing table loads its columns.

- `Value Column`: a numeric or JSON column
- `String Value Column`: an optional VARCHAR column for text values

Storage behavior depends on the selected columns.

| Mode | Configuration | Result |
|---|---|---|
| Numeric | Numeric `Value Column` only | Stores numeric and boolean values as rows |
| Numeric and string | Numeric `Value Column` plus `String Value Column` | Stores numeric/boolean and text values in the appropriate columns |
| JSON | JSON `Value Column` | Stores one merged JSON payload row per collection cycle |
| String-only | No numeric/JSON column; select a VARCHAR column | Converts every value to text before storing it |

A string node is not stored when only a numeric column is configured. Add a `String Value Column` or use a JSON column.

### Create a New Table Automatically

For a new job, enter a new Table name without a dot (`.`). When the table is confirmed missing, the form displays:

`Table not found. It will be created automatically when the job is saved.`

Saving the job creates a time-based TAG table with `VALUE` and `STR_VALUE` columns. Auto-create is unavailable while editing an existing job or for qualified names such as `USER.TABLE`.

## Node Mapping

Nodes can be added in two ways.

- Manual: enter `Tag Name` and `Node ID`, then click `Add`.
- Browse: click `Browse` to open the OPC UA node tree.

In the Node Browser:

![Node Browser with real OPC UA nodes selected](/images/job-node-browser.png)

1. Enter the starting Node ID in `Browse From`.
2. Expand folders or use `Filter results by name or address...`.
3. Select one or more Variable Nodes.
4. Click `Apply` to update Node Mapping.

Non-numeric nodes cannot be selected in numeric-only mode. A String Value Column, JSON column, or string-only mode enables supported text nodes.

The Node Mapping table shows Tag Name, Node ID/Path, and Data Type. Edit one name directly, or select multiple rows and use `Rename N selected`. Bulk rename is performed in the Mapping table, not the Node Browser.

### Transform

Numeric nodes can use Bias and Multiplier. Drag the two calculation segments to change their order.

- `(value + bias) × multiplier`
- `(value × multiplier) + bias`

Transform does not apply to boolean values, text values, or string-only storage.

## Derived Tags

Click `New derived tag` to calculate a new tag from source nodes read in the same cycle.

![Derived Tag editor using two source nodes](/images/job-derived-tag-editor.png)

1. Name the derived tag.
2. Bind source nodes to variables `A` through `Z`.
3. Enter an expression such as `A * 1.8 + 32` and confirm its validation result.
4. Set `TIME SOURCE` to `latest` or a specific variable.
5. Choose an `ON ERROR` action.

Error actions are:

- `skip`: do not store a value
- `write null`: store null
- `use fallback value`: store a specified number
- `hold last value`: reuse the last valid value

`write null` is unavailable for a SUMMARIZED value column. Derived Tags are not collected in string-only mode. Under `requestTime`, all rows use the read time, so `TIME SOURCE` is preserved but not applied.

## Collection Policy

### Time Policy

- `sourceTime`: prefer the node's `sourceTimestamp`, or fall back to the request time. A Derived Tag follows its `TIME SOURCE`.
- `requestTime`: use one request time for all source and Derived Tag rows from the read.

JSON merges several nodes into one row and can carry only one timestamp. A JSON Value Column therefore requires `requestTime`.

### Bad Status Policy

- `skip`: do not store a Bad Status value. A Derived Tag using that input applies its own `ON ERROR` action.
- `ignore`: store and calculate with the value when it exists, regardless of quality status.

## Logging Controls and Save

- `Log Level`: the threshold among `TRACE`, `DEBUG`, `INFO`, `WARN`, and `ERROR`
- `File Limit`: the number of log files to retain

Use `Create` or `Update` in the header to save. Start and stop the job with its sidebar switch. A running job must be stopped before it can be edited or deleted.

## Navigation

- [Previous: Server Settings]({{< relref "server-settings" >}})
- [Back to Index]({{< relref "/" >}})
- [Next: Monitoring and Logs]({{< relref "monitoring-and-logs" >}})
