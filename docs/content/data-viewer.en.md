---
title: Data Viewer
weight: 50
---

Data Viewer displays values that a job stored in Machbase Database as a table or chart.

## Open Data Viewer

1. Select a job on the Dashboard.
2. Click `Data Viewer` in the page header.

The viewer uses the selected job's Database, Table, Nodes, and Derived Tags. The button is disabled for a job that uses a JSON Value Column because the current viewer cannot safely split a JSON payload into its table and numeric-chart views.

## Select Tags

Select one or more tags in the `Tags` list on the left.

- Source Nodes and Derived Tags can be selected together.
- Search by tag name with the filter field.
- A Derived Tag has a `derived` badge.
- The `Hierarchy` tab appears only when the table provides Asset Hierarchy metadata.

## Time Range

Use the calendar button to choose a range. For example, `Last 10 minutes` queries the ten minutes ending at the current time. Ranges such as `Last 10 minutes of data` are anchored to the latest data time instead.

The refresh button pins the relative range again at the current or latest-data time and reloads the data. The resolved start and end times are displayed on screen.

You can also change the time display format and Time Zone.

## Raw View

`Raw` displays stored rows in a table.

![Data Viewer Raw view showing actual stored data](/images/data-viewer-raw.png)

- `Backward`: read from newer data toward older data
- `Forward`: read from older data toward newer data
- Page controls: move to the previous, next, first, or end page
- `Rows / tag`: the number of rows read per selected tag on one page

With several tags selected, page size reflects both the number of tags and the `Rows / tag` value.

## Chart View

`Chart` plots selected numeric tags as lines over time.

![Chart view showing source and Derived Tags together](/images/data-viewer-chart.png)

- Drag with the left mouse button to zoom into the selected range.
- Drag with the middle mouse button to move the visible range.
- Drag with the right mouse button to zoom out.
- Use the mini chart and range handles to zoom in or out.
- Use a tag chip's split action to create an individual tag chart.
- A split chart can have its own `Time Range`.
- `Global Time` applies one chart's range to the other charts.

## Open in Tag Analyzer

Choose `Tag Analyzer` from a Chart action menu. This works when OPC UA Client is opened **inside neo-web**.

The following conditions must be met:

- The job must use a numeric Value Column.
- At least one tag must be selected.
- The table's tag-name, time, and value columns must be available.

A string-only job can be inspected in Raw view, but it cannot be sent to Tag Analyzer.

## Navigation

- [Previous: Monitoring and Logs]({{< relref "monitoring-and-logs" >}})
- [Back to Index]({{< relref "/" >}})
- [Next: Troubleshooting]({{< relref "troubleshooting" >}})
