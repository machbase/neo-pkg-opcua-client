---
title: Troubleshooting
weight: 50
---

# Troubleshooting

## Cannot Connect to the OPC UA Server

Check the following:

- Whether the Endpoint URL is correct
- Whether the OPC UA server is actually running
- Whether network access is available

If `Disconnected` appears in the dashboard, check the endpoint and server status first.

## The Job Is Running but No Values Are Stored

Possible causes:

- The Node ID is incorrect
- The node does not allow read access
- The interval is normal, but the actual value is not changing
- The selected Database Column configuration is not correct

Check the Node Mapping and Database Column configuration first.

## Table or Column Selection Is Empty

Check the following:

- Whether the Database Server connection works
- Whether the account has permission to read the table list
- Whether the actual table structure is prepared

## String Values Are Not Stored

- To collect string values, you must either select a `JSON` column in `Value Column` or choose a `String Value Column`.
- If `Value Column` is a numeric column and `String Value Column` is empty, string values are not stored.
- If `Value Column` is a `JSON` column, one collection cycle is stored as a JSON payload, so string values can also be stored there.
- If the table has no numeric or JSON column and the form switches to string-only mode, selecting `String Value Column` is required.
- Also check whether the selected table actually has a `VARCHAR` column for string storage.

## The Last Collection Time Is Too Old

- Check whether the job is actually `running`.
- Check whether the OPC UA card shows `Stale` or `Disconnected`.
- If needed, open the log files and look for repeated errors.

## Recommended Practices

- Start with only a few nodes and confirm that collection works.
- Do not begin with an interval that is too short.
- Add Transform settings only after basic collection is stable.

## Navigation

- [Previous: Monitoring and Logs](./monitoring-and-logs.en.md)
- [Back to Index](./index.en.md)
