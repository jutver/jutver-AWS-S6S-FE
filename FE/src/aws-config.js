const awsConfig = {
  Auth: {
    Cognito: {
      userPoolId: "ap-southeast-1_HnpktydzR",
      userPoolClientId: "4la5dgv72atrea1g2nqsle0dit",
      loginWith: {
        email: true,
      },
    },
  },
};

export default awsConfig;
