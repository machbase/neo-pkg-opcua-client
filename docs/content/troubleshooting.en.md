---
title: Troubleshooting
weight: 60
---

## Quick Check Table

| Symptom | Check first |
|---|---|
| Database Server connection fails | Host, Port, credentials, and `READ_WRITE` database access |
| OPC UA Server connection fails | Endpoint, Security Mode/Policy, Auth Mode, certificate, and key |
| A Table is missing from the list | Database connection and permission; whether it is a time-based TAG table |
| Job is Running but stores no values | Node ID, read permission, columns, Bad Status Policy, and logs |
| A Derived Tag is not stored | Expression validation, variable binding, ON ERROR, and string-only mode |
| Data Viewer is disabled | Whether the Value Column is JSON |
| Edit/Delete is disabled | Whether the job is Running; stop it first |

## Database Server Does Not Connect

- Verify Host and Port.
- Recheck User and Password.
- The database list is loaded when the Database picker is opened in the form.
- The registration form has no Connection Test button. Save first, then test from the Database Servers list.
- The collector writes data, so only a `READ_WRITE` database can be used.

## OPC UA Server Does Not Connect

- Verify the Endpoint URL and that the server is running.
- Select the same Security Mode and Security Policy as the server.
- For `UserName` authentication, check Username and Password.
- For `Sign & Encrypt`, check that the client certificate and private key match and that the server trusts the certificate.
- Changing connection fields clears the earlier success state. Run `Connection Test` again.

## Read Batch Size Is Disabled

For a new OPC UA Server, Read Batch Size remains disabled until the connection test succeeds. Run `Connection Test` first. Batch Size must be a positive integer. When the server provides a positive `Max Nodes Per Read`, Batch Size cannot exceed it. When the server returns `0` or does not provide a value, the UI displays `Unlimited` and no upper limit is enforced for Batch Size.

## A Table or Column Is Missing

- Check the Database Server connection and table-list permission.
- Distance-based TAG tables are intentionally hidden. The collector writes collection time to the base column and supports time-based TAG tables only.
- An existing table's Value Column must be numeric or JSON.
- A String Value Column must be VARCHAR.

## A New Table Is Not Created Automatically

Auto-create works only when:

- a new job is being created,
- the table is confirmed not to exist, and
- the table name does not contain a dot (`.`).

It is unavailable while editing an existing job, for a qualified name such as `USER.TABLE`, or when a connection failure prevents the form from confirming that the table is missing.

## String Values Are Not Stored

- A numeric Value Column alone does not store text values.
- Select a `String Value Column` or use a JSON Value Column.
- A table with no numeric/JSON column enters string-only mode and requires a VARCHAR column.
- String-only mode converts every value to text and does not collect Derived Tags.

## sourceTime Is Unavailable with JSON

JSON mode stores several nodes in one payload row. A row can have only one timestamp, so only `requestTime` is supported. It is normal for the form to switch Time Policy to `requestTime` and disable `sourceTime`.

## Data Viewer Cannot Be Opened

Data Viewer does not currently support a job whose Value Column is JSON. Its Dashboard button is disabled. Use Data Viewer with a job that stores values in a regular numeric or string-only column.

A string-only job can be read in the Raw table, but numeric Chart and Tag Analyzer features are limited. Tag Analyzer also requires the package to be opened inside neo-web.

## A Derived Tag Cannot Be Added or Stored

- Bind a source Node to every variable.
- Make sure uppercase variables used by the expression match the registered aliases.
- Expression validation must succeed before `Add derived tag` is enabled.
- A Derived Tag name cannot conflict with a source Node or another Derived Tag.
- `write null` is unavailable on a SUMMARIZED Value Column.
- Derived Tags are not collected in string-only mode.

## Values Disappear After a Bad Status

With `Bad Status Policy` set to `skip`, a Bad Status source value is not stored. A Derived Tag that uses it follows its own `ON ERROR` action. Select `ignore` only when you understand the risk and want to store an available value regardless of its quality.

## A Running Job Stores No Values

1. Check the last collection time and any `Disconnected` or `Stale` badge.
2. Verify the Node ID and server-side read permission.
3. Check that the selected Table and Columns match the actual schema.
4. For text Nodes, provide a String Value Column or JSON column.
5. Check Bad Status Policy.
6. Look for repeated errors in the header `Live Logs` window and in `View Logs`.

## Navigation

- [Previous: Data Viewer]({{< relref "data-viewer" >}})
- [Back to Index]({{< relref "/" >}})
