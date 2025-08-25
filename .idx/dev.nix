# To learn more about how to use Nix to configure your environment
# see: https://firebase.google.com/docs/studio/customize-workspace
{pkgs}: {
  # Which nixpkgs channel to use.
  channel = "stable-24.11"; # or "unstable"

  # Packages available in the environment
  packages = [
    pkgs.nodejs_20
    pkgs.zulu
    pkgs.undollar       # adds $ command permanently
    pkgs.firebase-tools # Firebase CLI via Nix
  ];

  # Sets environment variables in the workspace
  env = {};

  # Firebase emulator settings
  services.firebase.emulators = {
    detect = false;
    projectId = "demo-app";
    services = ["auth" "firestore"];
  };

  idx = {
    extensions = [
      # "vscodevim.vim"
    ];

    workspace = {
      onCreate = {
        default.openFiles = [
          "src/app/page.tsx"
        ];
      };
    };

    previews = {
      enable = true;
      previews = {
        web = {
          command = ["npm" "run" "dev" "--" "--port" "$PORT" "--hostname" "0.0.0.0"];
          manager = "web";
        };
      };
    };
  };
}
