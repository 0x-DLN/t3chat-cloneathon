// eslint-disable-next-line import/no-anonymous-default-export
export default {
  providers: [
    {
      type: "customJwt",
      applicationID: "convex",
      issuer: "http://localhost:3000",
      jwks: "http://localhost:3000/api/auth/jwks",
      algorithm: "RS256",
    },
  ],
};
