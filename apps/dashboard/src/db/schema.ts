import { pgTable, text, timestamp, integer, boolean, pgEnum, uuid, varchar, jsonb } from 'drizzle-orm/pg-core';

export const planEnum = pgEnum('plan', ['standard']);
export const tenantStatusEnum = pgEnum('tenant_status', ['provisioning', 'active', 'suspended', 'terminated']);
export const userRoleEnum = pgEnum('user_role', ['owner', 'admin', 'member']);
export const subscriptionStatusEnum = pgEnum('subscription_status', ['active', 'past_due', 'canceled', 'incomplete', 'trialing']);
export const workflowStatusEnum = pgEnum('workflow_status', ['active', 'paused', 'error', 'configuring']);
export const connectorStatusEnum = pgEnum('connector_status', ['connected', 'disconnected', 'error']);

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 64 }).notNull(),
  plan: planEnum('plan').notNull().default('standard'),
  status: tenantStatusEnum('status').notNull().default('provisioning'),
  instanceId: varchar('instance_id', { length: 64 }),
  region: varchar('region', { length: 32 }).default('us-east-1'),
  kmsKeyArn: varchar('kms_key_arn', { length: 256 }),
  encryptionStatus: varchar('encryption_status', { length: 32 }).default('none'),
  lastKeyRotation: timestamp('last_key_rotation'),
  provisionedAt: timestamp('provisioned_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 128 }).notNull(),
  passwordHash: text('password_hash').notNull(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  role: userRoleEnum('role').notNull().default('member'),
  emailVerified: boolean('email_verified').notNull().default(false),
  lastLoginAt: timestamp('last_login_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  token: varchar('token', { length: 128 }).notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id).unique(),
  stripeCustomerId: varchar('stripe_customer_id', { length: 128 }).notNull(),
  stripeSubscriptionId: varchar('stripe_subscription_id', { length: 128 }).notNull(),
  status: subscriptionStatusEnum('status').notNull().default('incomplete'),
  currentPeriodStart: timestamp('current_period_start'),
  currentPeriodEnd: timestamp('current_period_end'),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const connectors = pgTable('connectors', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  type: varchar('type', { length: 32 }).notNull(),
  status: connectorStatusEnum('status').notNull().default('disconnected'),
  config: jsonb('config').default({}),
  lastEventAt: timestamp('last_event_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const workflows = pgTable('workflows', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  skillId: varchar('skill_id', { length: 64 }).notNull(),
  name: varchar('name', { length: 128 }).notNull(),
  status: workflowStatusEnum('status').notNull().default('configuring'),
  config: jsonb('config').default({}),
  lastRunAt: timestamp('last_run_at'),
  runCount: integer('run_count').notNull().default(0),
  errorCount: integer('error_count').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  userId: uuid('user_id').references(() => users.id),
  action: varchar('action', { length: 64 }).notNull(),
  resource: varchar('resource', { length: 64 }).notNull(),
  resourceId: varchar('resource_id', { length: 128 }),
  metadata: jsonb('metadata').default({}),
  ipAddress: varchar('ip_address', { length: 45 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const scheduleStatusEnum = pgEnum('schedule_status', ['active', 'paused']);

export const schedules = pgTable('schedules', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  skillId: varchar('skill_id', { length: 64 }).notNull(),
  name: varchar('name', { length: 128 }).notNull(),
  cron: varchar('cron', { length: 64 }).notNull(),
  status: scheduleStatusEnum('status').notNull().default('active'),
  lastRunAt: timestamp('last_run_at'),
  lastRunStatus: varchar('last_run_status', { length: 32 }),
  nextRunAt: timestamp('next_run_at'),
  runCount: integer('run_count').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const tokenTypeEnum = pgEnum('token_type', ['email_verification', 'password_reset']);

export const verificationTokens = pgTable('verification_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: varchar('token', { length: 128 }).notNull().unique(),
  type: tokenTypeEnum('type').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
