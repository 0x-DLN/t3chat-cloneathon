// eslint-disable-next-line import/no-anonymous-default-export
export default {
  providers: [
    {
      type: "customJwt",
      applicationID: "convex",
      issuer: process.env.URL,
      jwks: `${process.env.URL}/api/auth/jwks`,
      algorithm: "RS256",
    },
  ],
};
