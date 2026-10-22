.PHONY: all build install enable dev uninstall clean

all: build

build:
	./build.sh

install:
	./install.sh

enable:
	./install.sh --enable

dev:
	./install.sh --dev

uninstall:
	./install.sh --uninstall

clean:
	rm -f stylesheet*.css
	rm -f schemas/gschemas.compiled
