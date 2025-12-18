# The Project App Repository
- Link to [The Project GitOps Repository](https://github.com/sunkken/dwk-project-gitops-repo)  

## Live Deployments (Google Cloud)
* **Prod branch** → http://34.36.81.209/ (temporary)
* **Staging branch** → http://34.49.76.228/ (temporary)

## Setup Overview
* **Todo App** (`todo-app`)
  Serves the todo frontend and current picture.
* **Todo-App-Writer** (`todo-app-writer`)
  Downloads a random picture every 10 minutes from Picsum Lorem and writes it to a persistent volume.
* **Todo Backend** (`todo-backend`)
  Provides todo functionality and stores todos either in memory or in Postgres.
* **Todo Broadcaster** (`todo-broadcaster`)
  Subscribes to NATS `todos.events` and forwards todo events to an external webhook (Discord/Slack/Telegram).
* **Postgres Database** (`tododb`)
  StatefulSet that stores todos persistently.  
* **Todo CronJob** (`todo-cronjob`)
  Generates periodical random "Read <Wikipedia URL>" todos and posts them to the backend.
* **Tododb Backup Job** (`tododb-backup`)
  Creates daily backups of the Postgres database and stores them on Google Cloud Storage.

## License
MIT  