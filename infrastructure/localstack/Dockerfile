# Wraps the stock LocalStack image so Render (which can't bind-mount repo
# files into a plain `image:`-based service) still gets the same
# bucket/queue seeding docker-compose already does locally via its
# `./infrastructure/localstack/init:/etc/localstack/init/ready.d` mount.
FROM localstack/localstack:3.8

COPY infrastructure/localstack/init/ /etc/localstack/init/ready.d/
