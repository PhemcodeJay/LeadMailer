# LeadMailer Makefile
.PHONY: install run test build docker-build docker-up clean

install:
	npm install

run:
	node app.js

test:
	node --test test/

build:
	node --check app.js

docker-build:
	docker build -t leadmailer .

docker-up:
	docker compose up

clean:
	rm -rf node_modules dist