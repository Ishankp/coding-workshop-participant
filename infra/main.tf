resource "random_id" "this" {
  byte_length = 4

  keepers = {
    seed_input = try(var.aws_app_code, terraform.workspace)
  }
}

resource "random_pet" "this" {
  length    = 3
  separator = "-"

  keepers = {
    seed_input = try(var.aws_app_code, terraform.workspace)
  }
}

# Secret used to sign session tokens in the cloud. Generated once per app code,
# stored only in Terraform state and injected into every Lambda as JWT_SECRET.
# Locally (LocalStack) the services fall back to a fixed dev secret instead.
resource "random_password" "jwt" {
  length  = 48
  special = false

  keepers = {
    seed_input = try(var.aws_app_code, terraform.workspace)
  }
}
