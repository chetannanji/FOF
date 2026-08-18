# Sport Sync Space Backend API

Backend API server for Sport Sync Space built with Node.js, Express, TypeScript, Prisma, and PostgreSQL.

## Prerequisites

- Node.js 18+ and npm
- PostgreSQL database (local or cloud-hosted)

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up PostgreSQL Database

Choose one of these options:

#### Option A: Supabase (Recommended for beginners)
1. Go to [supabase.com](https://supabase.com) and create a free account
2. Create a new project
3. Go to Settings > Database
4. Copy the connection string (it looks like: `postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres`)
5. Replace `[YOUR-PASSWORD]` with your database password

#### Option B: Neon (Serverless PostgreSQL)
1. Go to [neon.tech](https://neon.tech) and create a free account
2. Create a new project
3. Copy the connection string from the dashboard

#### Option C: Railway
1. Go to [railway.app](https://railway.app) and create an account
2. Create a new PostgreSQL service
3. Copy the connection string from the service settings

#### Option D: Local PostgreSQL
1. Install PostgreSQL locally
2. Create a database: `createdb sport_sync`
3. Use connection string: `postgresql://postgres:password@localhost:5432/sport_sync`

### 3. Configure Environment Variables

Create a `.env` file in the `server` directory:

```env
# Pooled URL for the running API (Neon: host contains -pooler; Supabase: port 6543 + ?pgbouncer=true)
DATABASE_URL="postgresql://user:password@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require&connection_limit=5"
# Direct URL for migrations only (Neon: host without -pooler; Supabase: port 5432)
DIRECT_URL="postgresql://user:password@ep-xxx.region.aws.neon.tech/neondb?sslmode=require"
JWT_SECRET="your-secret-key-change-in-production"
PORT=3000
NODE_ENV="development"
FRONTEND_URL="https://fof.co.ke"
```

**Important:** Change `JWT_SECRET` to a strong random string in production!

### 4. Set Up Database

```bash
# Generate Prisma Client
npm run prisma:generate

# Run database migrations
npm run prisma:migrate

# Seed the database with initial data
npm run prisma:seed
```

### 5. Start the Server

```bash
# Development mode (with hot reload)
npm run dev

# Production mode
npm run build
npm start
```

The server is deployed at `https://api.fof.co.ke` (or the port specified in `.env`).

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout
- `POST /api/auth/signup` - Sign up new user

### Participants
- `GET /api/participants` - List participants (admin/community_admin)
- `GET /api/participants/me` - Get my participant
- `POST /api/participants` - Create participant
- `PATCH /api/participants/:id/status` - Update participant status
- `PATCH /api/participants/me/sports` - Update my sports
- `DELETE /api/participants/:id` - Delete participant

### Volunteers
- `GET /api/volunteers` - List volunteers
- `POST /api/volunteers` - Create volunteer
- `PATCH /api/volunteers/:id` - Update volunteer

### Sports
- `GET /api/sports` - List all sports
- `GET /api/sports/tree` - List sports as tree (parent with children)
- `GET /api/sports/subsports/:parentId` - Get subsports
- `GET /api/sports/:id` - Get sport by ID
- `POST /api/sports` - Create sport (admin/sports_admin)
- `PATCH /api/sports/:id` - Update sport (admin/sports_admin)
- `DELETE /api/sports/:id` - Delete sport (admin/sports_admin)

### Communities
- `GET /api/communities` - List communities
- `GET /api/communities/:id` - Get community by ID
- `POST /api/communities` - Create community (admin)
- `PATCH /api/communities/:id` - Update community (admin)
- `DELETE /api/communities/:id` - Delete community (admin)

### Users
- `GET /api/users` - List users (admin)
- `GET /api/users/:id` - Get user by ID (admin)
- `POST /api/users` - Create user (admin)
- `PATCH /api/users/:id` - Update user (admin)
- `DELETE /api/users/:id` - Delete user (admin)

### Other
- `GET /api/departments` - List departments
- `GET /api/calendar` - List calendar items
- `GET /api/calendar/timing` - List timing
- `GET /api/calendar/draws` - List draws
- `GET /api/settings` - Get settings
- `PATCH /api/settings` - Update settings (admin)
- `POST /api/email/send` - Send email
- `GET /api/email/outbox` - List outbox (admin)

## Authentication

The API uses JWT (JSON Web Tokens) for authentication. Include the token in the Authorization header:

```
Authorization: Bearer <token>
```

## Database Schema

The database schema is defined in `prisma/schema.prisma`. Key models:

- **User** - System users with roles (admin, community_admin, sports_admin, volunteer_admin, volunteer, user)
- **Participant** - Sports participants
- **Volunteer** - Event volunteers
- **Community** - Communities
- **Sport** - Sports with hierarchical support (parent-child relationships)
- **Department** - Volunteer departments
- **CalendarItem** - Calendar events
- **Settings** - Application settings
- **Email** - Email outbox

## Development

### Prisma Commands

```bash
# Generate Prisma Client
npm run prisma:generate

# Create a new migration
npm run prisma:migrate

# Open Prisma Studio (database GUI)
npm run prisma:studio

# Seed database
npm run prisma:seed
```

### Project Structure

```
server/
├── src/
│   ├── index.ts              # Express app entry point
│   ├── routes/               # API route handlers
│   ├── middleware/           # Auth, validation, error handling
│   ├── utils/                # Helper functions
│   └── types/                # TypeScript types
├── prisma/
│   ├── schema.prisma         # Prisma schema
│   ├── migrations/           # Database migrations
│   └── seed.ts               # Database seeding
├── .env                      # Environment variables
└── package.json
```

## Deployment

### Railway

1. Connect your GitHub repository to Railway
2. Add environment variables in Railway dashboard
3. Railway will automatically deploy on push

### Render

1. Create a new Web Service on Render
2. Connect your GitHub repository
3. Set root directory to `server`
4. Set build command: `yarn install && yarn prisma:generate && yarn build`
5. Set start command: `yarn start` (runs `prisma migrate deploy` then starts the server)
6. Add environment variables (see below)

### Vercel

Note: Vercel is primarily for serverless functions. For a full Express app, consider Railway or Render.

## Environment Variables

- `DATABASE_URL` - **Pooled** PostgreSQL URL for the API at runtime (required)
- `DIRECT_URL` - **Direct** PostgreSQL URL for `prisma migrate` / `migrate deploy` (required on Neon/Supabase with pooling)
- `JWT_SECRET` - Secret key for JWT tokens (required)
- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production)
- `FRONTEND_URL` - Frontend URL for CORS (default: https://fof.co.ke)

## Troubleshooting

### Database Connection Issues
- Verify your `DATABASE_URL` is correct
- Check if your database is accessible from your network
- For cloud databases, ensure your IP is whitelisted (if required)

### Migration Issues
- **Neon / Supabase:** Use `DIRECT_URL` (non-pooler) for migrations; use pooled `DATABASE_URL` for the app. Running migrations only through a transaction pooler often fails or leaves schema out of date.
- Check pending migrations: `yarn prisma migrate status`
- Apply to production DB: `yarn prisma migrate deploy` (with production `DATABASE_URL` and `DIRECT_URL` in `.env` or Render env)
- Make sure Prisma Client is generated: `npm run prisma:generate`
- Check database permissions
- Verify schema.prisma is valid

### Authentication Issues
- Verify JWT_SECRET is set
- Check token expiration (default: 7 days)
- Ensure token is included in Authorization header

## License

ISC



