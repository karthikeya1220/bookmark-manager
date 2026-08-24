import { createYoga, createSchema } from 'graphql-yoga';

const yoga = createYoga({
  schema: createSchema({
    typeDefs: /* GraphQL */ `
      type Query {
        hello: String!
      }
    `,
    resolvers: {
      Query: {
        hello: () => 'Hello from GraphQL Yoga!',
      },
    },
  }),
});

const server = Bun.serve({
  fetch: yoga,
  port: Number(process.env.PORT) || 3000,
});

console.info(
  `Server is running on ${new URL(
    yoga.graphqlEndpoint,
    `http://${server.hostname}:${server.port}`
  )}`
);
