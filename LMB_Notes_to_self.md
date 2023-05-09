# LMB's notes to himself (CLI multiarch)

[Fibery Improvement](https://balena.fibery.io/Organisation/Improvements/Update-the-CLI-to-support-multi-arch-releases-MVP-863)
[Akis' API PR](https://github.com/balena-io/balena-api/pull/4336)

## TODO

### Assorted things

* How do we handle options that appear multiple times? `-A arch1 -A arch2` or
  `-A arch1,arch2`?
    * oclif uses `-A this -A that`, which has problems. First, it doesn't error
      out when we pass multiple ones for flags configured as `multiple: false`.
      (Not a big issue, as I just changed it to `multiple: true`).
    * But here's the worse. The two invocations below give different results.
      The first one is parsed in a very broken way (as if the path was an arch,
      too). Yikes! 🤮
        * `./bin/balena-dev build -A aarch64 -A x86_64  ~/Projects/balena/lmbarros-test`
        * `./bin/balena-dev build /home/lmb/Projects/balena/lmbarros-test -A aarch64 -A x86_64`
* What about `push` to device?
* Tests.

### Build

* [X] `balena build -f legacy/intel-nuc`: tag the image with the architecture so
  it can be discovered by deploy.
* [X] `balena build -f legacy/raspberry-pi -e`: tag the image with the
  architecture so it can be discovered by deploy.
* [X] `balena build -A amd64 -d intel-nuc`: tag the image with the architecture
  so it can be discovered by deploy.
* [X] `balena build -A armv7hf -d raspberry-pi -e`: tag the image with the
  architecture so it can be discovered by deploy.
* [X] `balena build -A amd64`: use the provided architecture to build a single
  image; reject device-specific template files or project resolutions; tag the
  image with the architecture so it can be discovered by deploy.
* [X] `balena build -A amd64 -e`: use the provided architecture to build a
  single image with QEMU; reject device-specific template files or project
  resolutions; tag the image with the architecture so it can be discovered by
  deploy.
* [ ] `balena build -f multiarch/amd64-and-armv7hf`: Error: "Local builds are
  currently limited to one image at a time. Provide a single architecture (-A)
  and repeat for each desired image."; in the future we could automatically
  queue up multiple builds in series (not MVP).
* [X] `balena build -A amd64 -A armv7hf`: Error: "Local builds are currently
  limited to one image at a time. Provide a single architecture (-A) and repeat
  for each desired image."; in the future we could automatically queue up
  multiple builds in series (not MVP).
* [X] `balena build -A amd64 -A armv7hf -d intel-nuc`: Error: "Local builds are
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

## Required doc updates

* Project resolutions: device-specific stuff is rejected. (Learn/Deploy)

## References

* [Project
  resolutions](https://docs.balena.io/learn/deploy/deployment/#project-resolutions).
