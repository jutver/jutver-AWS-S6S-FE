const awsConfig = {
  Auth: {
    Cognito: {
      userPoolId: "ap-southeast-1_hiLeWHnss",
      userPoolClientId: "33uvvv9b7k9jusjd0l2p2ufgl0",
      loginWith: {
        email: true,
      },
    },
  },
};

export default awsConfig;
