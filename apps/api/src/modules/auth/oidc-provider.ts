import * as oidc from "openid-client";

export interface OidcProviderOptions {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  postLogoutRedirectUri: string;
}

export interface OidcAuthorizationTransaction {
  state: string;
  codeVerifier: string;
  nonce: string;
}

export interface OidcIdentity {
  issuer: string;
  subject: string;
}

export class OidcProvider {
  private configurationPromise: Promise<oidc.Configuration> | null = null;
  private readonly issuer: string;

  constructor(private readonly options: OidcProviderOptions) {
    this.issuer = options.issuer.replace(/\/$/, "");
  }

  async createAuthorizationRequest(): Promise<{
    url: URL;
    transaction: OidcAuthorizationTransaction;
  }> {
    const configuration = await this.getConfiguration();
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();

    const url = oidc.buildAuthorizationUrl(configuration, {
      redirect_uri: this.options.redirectUri,
      scope: "openid",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      state,
      nonce,
    });

    return {
      url,
      transaction: { state, codeVerifier, nonce },
    };
  }

  async completeAuthorization(
    currentUrl: URL,
    transaction: OidcAuthorizationTransaction,
  ): Promise<OidcIdentity> {
    const configuration = await this.getConfiguration();
    const tokens = await oidc.authorizationCodeGrant(configuration, currentUrl, {
      pkceCodeVerifier: transaction.codeVerifier,
      expectedState: transaction.state,
      expectedNonce: transaction.nonce,
      idTokenExpected: true,
    });
    const claims = tokens.claims();

    if (!claims || claims.iss !== this.issuer || typeof claims.sub !== "string" || !claims.sub) {
      throw new Error("OIDC identity claims are invalid");
    }

    return { issuer: this.issuer, subject: claims.sub };
  }

  async buildLogoutUrl(): Promise<URL> {
    const configuration = await this.getConfiguration();
    return oidc.buildEndSessionUrl(configuration, {
      post_logout_redirect_uri: this.options.postLogoutRedirectUri,
    });
  }

  private async getConfiguration(): Promise<oidc.Configuration> {
    if (!this.configurationPromise) {
      this.configurationPromise = oidc
        .discovery(new URL(this.issuer), this.options.clientId, this.options.clientSecret)
        .catch((error: unknown) => {
          this.configurationPromise = null;
          throw error;
        });
    }
    return this.configurationPromise;
  }
}
