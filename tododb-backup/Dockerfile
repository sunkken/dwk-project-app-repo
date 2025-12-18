FROM postgres:16-alpine

# Install gcloud SDK (alpine version)
RUN apk add --no-cache python3 curl bash
RUN curl -sSL https://sdk.cloud.google.com | bash -s -- --install-dir=/usr/local
ENV PATH="/usr/local/google-cloud-sdk/bin:${PATH}"

WORKDIR /usr/src/app

COPY backup.sh .
RUN chmod +x backup.sh

CMD ["./backup.sh"]
