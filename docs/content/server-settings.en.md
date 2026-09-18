---
title: Server Settings
weight: 20
---

A job uses two types of connection profile.

- **Database Server**: the Machbase Database that stores collected values
- **OPC UA Server**: the OPC UA endpoint and its security settings

You may register them in either order, but both should be ready before creating a job.

## Register a Database Server

Open `Server Settings` in the left sidebar and click `Add Server`.

![Input fields shown while reviewing a saved Database Server profile](/images/database-server-form.png)

The form contains:

- `Name`: the profile name shown in the job form
- `Host`, `Port`
- `Database`
- `User`, `Password`

Open the picker in the `Database` field to load databases available to the current account. On a new server, enter `User` and `Password` first. Only `READ_WRITE` databases can be selected and saved.

Click `Create` when the form is complete. The registration form does not have its own Connection Test button.

## Test the Database Connection

![Database Server list after a successful connection test](/images/database-servers-tested.png)

1. Return to the `Database Servers` list.
2. Click the `Connection Test` icon for the saved server.
3. Confirm that `Connected` appears.

`Edit` changes the saved connection, and `Delete` removes the profile. Removing a profile used by a job can prevent that job from being edited or restarted correctly.

## Register an OPC UA Server

Open `OPC UA Servers` in the left sidebar and click `Add OPC UA Server`. The form has `Server Input` and `Security` tabs.

### Server Input

![Saved OPC UA Server profile after a successful connection test](/images/opcua-server-input-tested.png)

- `Name`: the profile name shown in the job form
- `Endpoint URL`: for example, `opc.tcp://127.0.0.1:4840`
- `Read Batch Size`: the number of nodes read in one batch

For a new profile, `Connection Test` must succeed before `Read Batch Size` and `Create` are enabled. The result shows the server's `Max Nodes Per Read`, and the allowed batch size follows that limit. The UI may show Unlimited when the server does not provide a limit.

### Security

![OPC UA Server Security settings](/images/opcua-server-security.png)

`Security Mode` provides:

- `None`
- `Sign & Encrypt`

With `Sign & Encrypt`, select one of these Security Policies:

- `Basic256Sha256`
- `Basic256`
- `Aes128_Sha256_RsaOaep`
- `Aes256_Sha256_RsaPss`

`Auth Mode` is `Anonymous` or `UserName`. With `UserName`, enter a Username and Password.

An encrypted connection requires a client certificate and private key. Paste their contents into `Cert PEM` and `Key PEM`, or choose the files. Never disclose a private key.

## Generate a Self-Signed Certificate

The key icon at the bottom of the `OPC UA Servers` list opens the certificate generator.

1. Enter the certificate name and validity period.
2. Click `Generate`.
3. Download the result as a ZIP and store it securely.
4. Add the certificate and key to an OPC UA Server profile when needed.

The result contains a private key. Do not expose it in screen sharing or screenshots.

## Test the OPC UA Connection

![OPC UA Server list after a successful connection test](/images/opcua-servers-tested.png)

- Before registration: use `Connection Test` at the bottom of the form.
- After registration: use the `Connection Test` icon in the `OPC UA Servers` list.

The test can fail when the endpoint, security mode, authentication, or certificate does not match the server.

## Navigation

- [Back to Index]({{< relref "/" >}})
- [Next: Create and Run Jobs]({{< relref "create-and-run-job" >}})
