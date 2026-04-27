# neo-pkg-opcua-client v1.0

An OPC UA data collection package for Machbase Neo that lets you browse nodes, map them to database columns, and monitor collection jobs from the web UI.

## Overview

neo-pkg-opcua-client is a built-in data collection package for reading industrial data from OPC UA servers and storing it in Machbase Neo.

Instead of running a separate external collector, you can register database servers, create collection jobs, choose OPC UA nodes, and control job execution directly from the browser. The package also provides status cards, live logs, and log file viewing so operators can check whether collection is running normally.

Manual: [User Manual](https://github.com/machbase/neo-pkg-opcua-client/blob/edit-docs/docs/index.en.md)

## Who is it for?

- **Operators** - Monitor OPC UA collection jobs and confirm that data is arriving in the expected tables
- **Engineers** - Configure node mappings and simple transform rules without building a separate ingestion service

## Key Features

- **Web-based Job Setup** - Create and update OPC UA collection jobs from the UI without editing configuration files by hand
- **OPC UA Node Browsing** - Browse the server address space and select nodes for collection instead of entering every item manually
- **Flexible Node Mapping** - Map OPC UA nodes to target database columns and keep the collection layout aligned with your table design
- **Transform During Collection** - Apply simple expressions while collecting so values can be adjusted before they are written
- **Separate Database Server Configuration** - Register database connection settings once and reuse them across multiple jobs
- **Operational Monitoring** - Check running state, monitored node count, last update time, live logs, and saved log files from the dashboard
