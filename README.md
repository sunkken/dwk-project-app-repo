# The Project

## Setup Overview
* **Picsum Writer** (`todo-app/picsum-writer`)
  Downloads a random picture every 10 minutes from Picsum Lorem and writes it to a persistent volume.
* **Todo Backend** (`todo-backend`)
  Provides todo functionality and stores todos either in memory or in Postgres.
* **Todo App** (`todo-app`)
  Serves the todo frontend and current picture.
* **Todo CronJob** (`todo-cronjob`)
  Automatically generates a random "Read <Wikipedia URL>" todo once every 4 hours and posts it to the backend.
* **Todo Broadcaster** (`todo-broadcaster`)
  Subscribes to NATS `todos.events` and forwards todo events to an external webhook (Discord/Slack/Telegram). Supports dry-run for local testing.
* **Postgres Database** (`tododb`)
  StatefulSet that stores todos persistently.

## Live Deployments (GKE)
* **Main branch** → http://34.36.81.209/ (temporary)
* **Dev branch** → http://34.49.76.228/ (temporary)

Deployments are automated via GitHub Actions on push to any branch.

## Local Development (k3d)

### Create Cluster
```bash
k3d cluster create --port 8082:30080@agent:0 -p 8081:80@loadbalancer --agents 2
```

### Create Persistent Volume
```bash
docker exec k3d-k3s-default-agent-0 mkdir -p /tmp/image
kubectl apply -f k3d-manifests/
```

### Deploy Apps and Database
```bash
kubectl apply -f k3d-manifests/
```

### Open in Browser
- Todo App → [http://localhost:8081](http://localhost:8081)  
- Todo Backend → [http://localhost:8081/api/todos](http://localhost:8081/api/todos)

## DBaaS vs DIY Database Comparison

### DBaaS (Google Cloud SQL)
**Pros:**
- Fully managed (automated backups, patches, updates)
- Built-in high availability and failover
- Point-in-time recovery out of the box
- Automatic scaling and performance optimization
- No cluster storage overhead

**Cons:**
- Higher cost (~$10-50/month minimum for small instances)
- Vendor lock-in to Google Cloud
- Network latency (external to cluster)
- Additional setup (VPC peering, service accounts, connection secrets)

### DIY (Self-hosted Postgres StatefulSet)
**Pros:**
- Lower cost (only storage costs, ~$1-5/month for PV)
- Full control over configuration and versions
- In-cluster communication (lower latency)
- Simpler initial setup (just apply manifests)
- Portable across cloud providers

**Cons:**
- Manual backup management required
- No automatic failover (single pod)
- Manual updates and security patches
- Potential data loss if namespace deleted
- Requires monitoring and maintenance effort

**Backup Comparison:**
- **DBaaS**: Automated daily backups, 7-day retention default, one-click restore, point-in-time recovery
- **DIY**: Manual backup scripts needed (`pg_dump` cronjobs), volume snapshots, restore requires manual intervention

**Summarized Opinion:** DIY is sufficient for development/learning. DBaaS recommended for production workloads requiring high availability.

## License
MIT  