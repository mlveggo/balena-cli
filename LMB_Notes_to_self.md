# LMB's notes to himself (CLI multiarch)

[Fibery Improvement](https://balena.fibery.io/Organisation/Improvements/Update-the-CLI-to-support-multi-arch-releases-MVP-863)

## TODO

### Build

* [X] `balena build -f legacy/intel-nuc`: tag the image with the architecture so
  it can be discovered by deploy.
* [X] `balena build -f legacy/raspberry-pi -e`: tag the image with the
  architecture so it can be discovered by deploy.
* [X] `balena build -A amd64 -d intel-nuc`: tag the image with the architecture
  so it can be discovered by deploy.
* [X] `balena build -A armv7hf -d raspberry-pi -e`: tag the image with the
  architecture so it can be discovered by deploy.
* [ ] `balena build -f multiarch/amd64-and-armv7hf`: Error: "Local builds are
  currently limited to one image at a time. Provide a single architecture (-A)
  and repeat for each desired image."; in the future we could automatically
  queue up multiple builds in series (not MVP).
* [ ] `balena build -A amd64`: use the provided architecture to build a single
  image; reject device-specific template files or project resolutions; tag the
  image with the architecture so it can be discovered by deploy.
* [ ] `balena build -A amd64 -e`. use the provided architecture to build a
  single image with QEMU; reject device-specific template files or project
  resolutions; tag the image with the architecture so it can be discovered by
  deploy.
* [ ] `balena build -A amd64 -A armv7hf`: Error: "Local builds are currently
  limited to one image at a time. Provide a single architecture (-A) and repeat
  for each desired image."; in the future we could automatically queue up
  multiple builds in series (not MVP).
* [ ] `balena build -A amd64 -A armv7hf -d intel-nuc`: Error: "Local builds are
  currently limited to one image at a time. Provide a single architecture (-A)
  and repeat for each desired image."

### Deploy

* [ ] `balena deploy legacy/intel-nuc`: find a local image with the correct
  architecture tag. Corner case: built with old CLI version (no arch tag),
  deploy with new CLI, which expects arch tag.
* [ ] `balena deploy legacy/intel-nuc —-build`: build a local image with the
  correct architecture tag.
* [ ] `balena deploy multiarch/amd64-and-armv7hf`: infer the device types and
  architectures from the fleet; reject device-specific template files or project
  resolutions; find a local images with the correct architecture tags; enforce
  that images exist for each architecture required by the application; deploy
  the images to the fleet as a single release.
* [ ] `balena deploy multiarch/amd64-and-armv7hf —-build`: infer the device
  types and architectures from the fleet; reject device-specific template files
  or project resolutions; build local images with the correct architecture tags
  (MVP+1?); deploy the images to the fleet as a single release

### Push

* [ ] `balena push multiarch/amd64-and-armv7hf`: infer the device types and
  architectures from the fleet; assign to multiple architecture-specific runners
  for each image [??? AKA using the updated API ???]; create a single
  release with all images, marked as incomplete while images are outstanding;
  reject device-specific template files or project resolutions.
* [ ] `balena push multiarch/amd64-and-armv7hf -e`: infer the device types and
  architectures from the fleet; assign to multiple x86 runners with QEMU [???];
  create a single release with all images, marked as incomplete while images are
  outstanding; reject device-specific template files or project resolutions.

### Fleet / Fleets

* [ ] Define syntax for creating selecting multiple device types when creating a
  fleet.
* [ ] Define syntax for making a fleet multi arch (i.e., replacing a single DT
  with a list of DTs)
* [ ] Define how to display the list of DTs for `balena fleet my_fleet`. Don't
  forget the JSON output case (current users may reply on it not being a list,
  for example.)
* [ ] Implement whatever we define above!
